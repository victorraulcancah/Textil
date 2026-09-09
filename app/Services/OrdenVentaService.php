<?php

namespace App\Services;

use App\Models\NotaVenta;
use App\Models\OrdenVenta;
use App\Models\OrdenVentaDetalle;
use App\Models\ProductoPresentacion;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Models\SerieDocumento;
use Illuminate\Support\Facades\DB;

/**
 * El recorrido del pedido, desde que se toma hasta que se factura.
 *
 * La regla que manda sobre todo lo demás: el pedido NO mueve stock. El
 * descuento ocurre una sola vez, cuando se emite la nota de venta.
 *
 *   borrador → solicitado → preparando → separado → despachado → facturado
 *                                                             ↘ anulado
 *
 * El corte entre quién hace qué está en "solicitado": hasta ahí es del
 * vendedor, de ahí en adelante es del almacén.
 *
 * El vendedor pide producto y cantidad —"150 metros de Polinán negro"— porque
 * es lo único que puede saber. Qué rollos cubren esos metros, y desde qué
 * almacén, lo decide el almacenero escaneándolos: cada escaneo asigna un rollo
 * a la línea que le corresponde y descuenta de lo que falta.
 */
class OrdenVentaService
{
    public function __construct(
        protected RolloService $rollos,
        protected NotaVentaService $notasVenta,
    ) {}

    /**
     * Toma el pedido. Nace en borrador: todavía se le pueden agregar y quitar
     * líneas sin consecuencias, porque nada está comprometido.
     */
    public function crear(array $data): OrdenVenta
    {
        return DB::transaction(function () use ($data) {
            $orden = OrdenVenta::create($this->cabecera($data) + [
                'serie' => $data['serie'] ?? 'OV',
                'numero' => $this->siguienteNumero('orden_venta', $data['serie'] ?? 'OV'),
                'estado' => OrdenVenta::BORRADOR,
            ]);

            $this->sincronizarDetalles($orden, $data['detalles'] ?? []);

            return $this->conRelaciones($orden);
        });
    }

    /**
     * Cambia las líneas o los datos del pedido. Solo mientras es borrador:
     * después el almacén ya está trabajando sobre él.
     */
    public function actualizar(OrdenVenta $orden, array $data): OrdenVenta
    {
        if (! $orden->esEditable()) {
            throw new \DomainException(
                'Solo se puede editar un pedido en borrador. Devuélvelo a borrador para modificarlo.'
            );
        }

        return DB::transaction(function () use ($orden, $data) {
            $orden->update($this->cabecera($data));
            $this->sincronizarDetalles($orden, $data['detalles'] ?? []);

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * El vendedor solicita el pedido al almacén.
     *
     * Se numera el requerimiento —el papel con el que el almacenero baja al
     * rack— y el pedido aparece en su bandeja. Todavía no se toca ningún
     * rollo: cuáles se usan lo decide el almacén al prepararlo.
     */
    public function solicitar(OrdenVenta $orden): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::SOLICITADO);

        return DB::transaction(function () use ($orden) {
            if ($orden->detalles()->doesntExist()) {
                throw new \DomainException('El pedido no tiene productos: agrega al menos uno antes de solicitarlo.');
            }

            $orden->update([
                'estado' => OrdenVenta::SOLICITADO,
                // El requerimiento se numera solo la primera vez: si el pedido
                // va y vuelve, el almacenero sigue viendo el mismo papel.
                'requerimiento_numero' => $orden->requerimiento_numero
                    ?: 'RA-'.$this->siguienteNumero('requerimiento_almacen', 'RA'),
            ]);

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * El cliente no confirmó: el pedido vuelve a borrador y se suelta todo lo
     * que el almacén hubiera avanzado.
     */
    public function devolverABorrador(OrdenVenta $orden): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::BORRADOR);

        return DB::transaction(function () use ($orden) {
            $this->liberarRollos($orden, RolloMovimiento::CANCELACION);

            $orden->update([
                'estado' => OrdenVenta::BORRADOR,
                'fecha_separacion' => null,
                'fecha_preparacion' => null,
                'usuario_prepara_id' => null,
                'almacen_id' => null,
            ]);

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * El pedido pasa a "preparando".
     *
     * No hay que pulsar nada: lo dispara el primer escaneo, y ese escaneo es
     * también el que fija de qué almacén sale la mercadería.
     */
    public function empezarPreparacion(OrdenVenta $orden, ?int $almacenId = null): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::PREPARANDO);

        return DB::transaction(function () use ($orden, $almacenId) {
            $orden->update([
                'estado' => OrdenVenta::PREPARANDO,
                'fecha_preparacion' => now(),
                'usuario_prepara_id' => auth()->id(),
                'almacen_id' => $orden->almacen_id ?: $almacenId,
            ]);

            return $orden->fresh();
        });
    }

    /**
     * El almacenero terminó: los rollos están apartados y verificados.
     *
     * Siguen dentro del almacén —salen recién con el despacho—, pero ya no se
     * tocan: están en su sitio esperando a que el cliente pase a recogerlos.
     */
    public function marcarSeparado(OrdenVenta $orden): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::SEPARADO);

        $orden->load('detalles.rollos');

        if (! $orden->estaVerificada()) {
            $faltan = $orden->detalles->sum(fn ($d) => $d->metrosPendientes());

            throw new \DomainException(
                'Faltan '.round($faltan, 2).' m por cubrir antes de darlo por separado.'
            );
        }

        return DB::transaction(function () use ($orden) {
            $orden->update([
                'estado' => OrdenVenta::SEPARADO,
                'fecha_separacion' => now(),
            ]);

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * El almacenero escanea un rollo, con la pistola o con la cámara.
     *
     * El rollo se asigna a la línea que pide ese mismo producto y todavía no
     * está cubierta. De él se toma lo que falte: si la línea necesita 20 m y
     * el rollo tiene 58, se apuntan 20 y el resto sigue siendo del almacén.
     */
    public function escanear(OrdenVenta $orden, string $codigo): array
    {
        if (! in_array($orden->estado, [OrdenVenta::SOLICITADO, OrdenVenta::PREPARANDO], true)) {
            throw new \DomainException(
                'Solo se pueden escanear rollos de un pedido solicitado o en preparación.'
            );
        }

        $codigo = trim($codigo);
        $rollo = Rollo::with('producto')->where('codigo', $codigo)->first();

        if (! $rollo) {
            throw new \DomainException("No existe ningún rollo con el código {$codigo}.");
        }

        if (! $rollo->estaDisponible()) {
            $estado = strtolower(Rollo::ESTADOS[$rollo->estado] ?? $rollo->estado);
            throw new \DomainException("El rollo {$codigo} está {$estado}: no se puede usar.");
        }

        // El primer escaneo fija el almacén y pone el pedido en preparación.
        if ($orden->estado === OrdenVenta::SOLICITADO) {
            $orden = $this->empezarPreparacion($orden, $rollo->almacen_id);
        } elseif ($orden->almacen_id && $orden->almacen_id !== $rollo->almacen_id) {
            throw new \DomainException(
                "El rollo {$codigo} está en otro almacén: este pedido se está preparando desde {$orden->almacen?->nombre}."
            );
        }

        $orden->load('detalles.rollos', 'detalles.presentacion');

        $linea = $orden->detalles->first(
            fn ($d) => ! $d->estaCubierta()
                && (int) $d->presentacion?->producto_id === (int) $rollo->producto_id
        );

        if (! $linea) {
            $yaEsta = $orden->detalles->contains(
                fn ($d) => $d->rollos->contains('rollo_id', $rollo->id)
            );

            throw new \DomainException($yaEsta
                ? "El rollo {$codigo} ya está asignado a este pedido."
                : "El rollo {$codigo} es de {$rollo->producto?->nombre}, que no falta en el requerimiento {$orden->requerimiento_numero}.");
        }

        return DB::transaction(function () use ($orden, $linea, $rollo, $codigo) {
            // Se toma lo que falte, sin pasarse de lo que da el rollo.
            $metros = min($linea->metrosPendientes(), (float) $rollo->metros_actual);

            $linea->rollos()->create([
                'rollo_id' => $rollo->id,
                'metros' => $metros,
                'escaneado_at' => now(),
                'usuario_escanea_id' => auth()->id(),
            ]);

            $this->rollos->cambiarEstado(
                $rollo,
                Rollo::EN_PREPARACION,
                RolloMovimiento::PREPARACION,
                'orden_venta',
                $orden->id,
            );

            $orden->load('detalles.rollos');
            $avance = $orden->avance();

            return [
                'rollo' => ['id' => $rollo->id, 'codigo' => $codigo, 'metros_actual' => (float) $rollo->metros_actual],
                'metros' => $metros,
                'producto' => $rollo->producto?->nombre,
                'verificados' => $avance['asignados'],
                'total' => $avance['pedidos'],
                'completo' => $orden->estaVerificada(),
            ];
        });
    }

    /** Quita un rollo que se asignó por error. */
    public function quitarRollo(OrdenVenta $orden, int $rolloId): OrdenVenta
    {
        if (! in_array($orden->estado, [OrdenVenta::PREPARANDO, OrdenVenta::SEPARADO], true)) {
            throw new \DomainException('Solo se pueden quitar rollos mientras el pedido se prepara.');
        }

        return DB::transaction(function () use ($orden, $rolloId) {
            $orden->load('detalles.rollos.rollo');

            foreach ($orden->detalles as $linea) {
                foreach ($linea->rollos->where('rollo_id', $rolloId) as $asignado) {
                    if ($asignado->rollo) {
                        $this->rollos->cambiarEstado(
                            $asignado->rollo,
                            Rollo::DISPONIBLE,
                            RolloMovimiento::CANCELACION,
                            'orden_venta',
                            $orden->id,
                        );
                    }
                    $asignado->delete();
                }
            }

            // Si se sacó un rollo, el pedido ya no está completo.
            if ($orden->estado === OrdenVenta::SEPARADO) {
                $orden->update(['estado' => OrdenVenta::PREPARANDO]);
            }

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * Los rollos salen físicamente del almacén.
     *
     * Ya vienen verificados de "separado": aquí no se vuelve a comprobar nada,
     * solo se deja constancia de quién y cuándo los entregó.
     */
    public function despachar(OrdenVenta $orden): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::DESPACHADO);

        return DB::transaction(function () use ($orden) {
            foreach ($this->rollosDe($orden) as $rollo) {
                $this->rollos->cambiarEstado(
                    $rollo,
                    Rollo::DESPACHADO,
                    RolloMovimiento::DESPACHO,
                    'orden_venta',
                    $orden->id,
                );
            }

            $orden->update([
                'estado' => OrdenVenta::DESPACHADO,
                'fecha_despacho' => now(),
                'usuario_despacha_id' => auth()->id(),
            ]);

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * Cierra el pedido: emite la nota de venta y, ahí sí, descuenta.
     *
     * Es el único punto de todo el recorrido que toca el inventario y la
     * plata. Corta los metros de cada rollo asignado, deja constancia de a qué
     * cliente se fue, y delega la nota en el servicio de siempre para que la
     * venta se registre igual que una de mostrador.
     *
     * @param  array{tipo_pago?: string, pagos?: list<array>, fecha_emision?: string, serie?: string}  $datos
     */
    public function facturar(OrdenVenta $orden, array $datos = []): NotaVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::FACTURADO);

        return DB::transaction(function () use ($orden, $datos) {
            $orden->load(['detalles.rollos.rollo', 'detalles.presentacion']);

            $nota = $this->notasVenta->crear([
                'serie' => $datos['serie'] ?? 'NV01',
                'orden_venta_id' => $orden->id,
                'cliente_id' => $orden->cliente_id,
                'almacen_id' => $orden->almacen_id,
                'vendedor_id' => $orden->vendedor_id,
                'fecha_emision' => $datos['fecha_emision'] ?? now()->toDateString(),
                'moneda' => $orden->moneda,
                'tipo_pago' => $datos['tipo_pago'] ?? 'contado',
                'subtotal' => (float) $orden->subtotal,
                'descuento_total' => (float) $orden->descuento_total,
                'total' => (float) $orden->total,
                'observaciones' => "Pedido {$orden->documento}",
                'detalles' => $this->detallesParaNota($orden),
                'pagos' => $datos['pagos'] ?? [],
            ]);

            // La tela sale físicamente: se cortan los metros de cada rollo.
            foreach ($orden->detalles as $linea) {
                foreach ($linea->rollos as $asignado) {
                    if (! $asignado->rollo) {
                        continue;
                    }

                    $this->rollos->cortar(
                        $asignado->rollo,
                        (float) $asignado->metros,
                        RolloMovimiento::VENTA,
                        'nota_venta',
                        $nota->id,
                    );

                    $rollo = $asignado->rollo->fresh();

                    // Si quedó tela, el rollo vuelve al stock con su mismo
                    // código; si salió entero, queda vendido y con dueño.
                    $this->rollos->cambiarEstado(
                        $rollo,
                        (float) $rollo->metros_actual > 0 ? Rollo::DISPONIBLE : Rollo::VENDIDO,
                        RolloMovimiento::VENTA,
                        'nota_venta',
                        $nota->id,
                    );

                    if ((float) $rollo->metros_actual <= 0) {
                        $rollo->update(['cliente_id' => $orden->cliente_id]);
                    }
                }
            }

            $orden->update(['estado' => OrdenVenta::FACTURADO]);

            return $nota->fresh(['detalles.rollo', 'cliente', 'almacen']);
        });
    }

    /**
     * Traduce las líneas del pedido a líneas de nota de venta.
     *
     * La nota se lleva la cantidad tal como se pidió, en la unidad de su
     * presentación: es lo que descuenta el stock y lo que ve el cliente.
     *
     * @return list<array<string, mixed>>
     */
    private function detallesParaNota(OrdenVenta $orden): array
    {
        return $orden->detalles->map(fn ($linea) => [
            'producto_presentacion_id' => $linea->producto_presentacion_id,
            // Un rollo por línea no cabe: la nota guarda el primero como
            // referencia y la trazabilidad fina vive en el pedido.
            'rollo_id' => $linea->rollos->first()?->rollo_id,
            'cantidad' => (float) $linea->cantidad,
            'precio_unitario' => (float) $linea->precio_unitario,
            'descuento' => (float) $linea->descuento,
            'subtotal' => (float) $linea->subtotal,
        ])->all();
    }

    /**
     * Anula el pedido y devuelve al stock los rollos que se hubieran asignado.
     */
    public function anular(OrdenVenta $orden, string $motivo): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::ANULADO);

        return DB::transaction(function () use ($orden, $motivo) {
            $this->liberarRollos($orden, RolloMovimiento::CANCELACION, $motivo);

            $orden->update([
                'estado' => OrdenVenta::ANULADO,
                'motivo_anulacion' => $motivo,
                'usuario_anula_id' => auth()->id(),
                'fecha_anulacion' => now(),
            ]);

            return $this->conRelaciones($orden->fresh());
        });
    }

    /* ------------------------------------------------------------------ */

    /** Los rollos que el almacén asignó a este pedido. */
    private function rollosDe(OrdenVenta $orden)
    {
        return $orden->loadMissing('detalles.rollos.rollo')
            ->detalles
            ->flatMap(fn ($d) => $d->rollos->pluck('rollo'))
            ->filter();
    }

    /** Suelta los rollos asignados y borra la asignación. */
    private function liberarRollos(OrdenVenta $orden, string $tipo, ?string $observacion = null): void
    {
        $orden->load('detalles.rollos.rollo');

        foreach ($orden->detalles as $linea) {
            foreach ($linea->rollos as $asignado) {
                if ($asignado->rollo) {
                    // Un rollo agotado no vuelve a disponible: ya no queda tela.
                    $destino = (float) $asignado->rollo->metros_actual > 0
                        ? Rollo::DISPONIBLE
                        : Rollo::AGOTADO;

                    $this->rollos->cambiarEstado(
                        $asignado->rollo,
                        $destino,
                        $tipo,
                        'orden_venta',
                        $orden->id,
                        null,
                        $observacion,
                    );
                }

                $asignado->delete();
            }
        }
    }

    /** Columnas propias del pedido (sin serie, número ni estado). */
    private function cabecera(array $data): array
    {
        return [
            'cliente_id' => $data['cliente_id'] ?? null,
            'vendedor_id' => $data['vendedor_id'],
            'fecha_emision' => $data['fecha_emision'],
            'fecha_entrega' => $data['fecha_entrega'] ?? null,
            'moneda' => $data['moneda'] ?? 'PEN',
            'observaciones' => $data['observaciones'] ?? null,
        ];
    }

    /**
     * Reescribe las líneas y recalcula los totales.
     *
     * La cantidad viene en unidades de la presentación y se guarda también en
     * metros: es la unidad en la que se miden los rollos y en la que se
     * comprueba después si la línea quedó cubierta.
     *
     * @param  list<array{producto_presentacion_id: int, cantidad: float, precio_unitario?: float, descuento?: float, descripcion?: string}>  $detalles
     */
    private function sincronizarDetalles(OrdenVenta $orden, array $detalles): void
    {
        $orden->detalles()->delete();

        $presentaciones = ProductoPresentacion::with('producto.presentaciones.unidadBase')
            ->whereIn('id', collect($detalles)->pluck('producto_presentacion_id'))
            ->get()
            ->keyBy('id');

        $subtotal = 0;
        $descuentos = 0;

        foreach ($detalles as $linea) {
            $presentacion = $presentaciones[$linea['producto_presentacion_id']] ?? null;
            if (! $presentacion) {
                continue;
            }

            $cantidad = round((float) $linea['cantidad'], 2);
            $precio = round((float) ($linea['precio_unitario'] ?? 0), 2);
            $descuento = round((float) ($linea['descuento'] ?? 0), 2);
            $importe = round($cantidad * $precio - $descuento, 2);

            $orden->detalles()->create([
                'producto_presentacion_id' => $presentacion->id,
                'cantidad' => $cantidad,
                'descripcion' => $linea['descripcion'] ?? null,
                'metros' => $this->aMetros($presentacion, $cantidad),
                'precio_unitario' => $precio,
                'descuento' => $descuento,
                'subtotal' => $importe,
            ]);

            $subtotal += $cantidad * $precio;
            $descuentos += $descuento;
        }

        $orden->update([
            'subtotal' => round($subtotal, 2),
            'descuento_total' => round($descuentos, 2),
            'total' => round($subtotal - $descuentos, 2),
        ]);
    }

    /**
     * Cuántos metros son esa cantidad en esa presentación.
     *
     * Un "Rollo 50 m" son 50 metros; un "Metro", uno. Se pasa por la unidad
     * base del producto, que es donde ambos factores están expresados.
     */
    private function aMetros(ProductoPresentacion $presentacion, float $cantidad): float
    {
        $basePorMetro = max((float) ($presentacion->producto?->factorBasePorMetro() ?? 1), 0.0001);
        $factor = (float) ($presentacion->factor_conversion ?: 1);

        return round($cantidad * $factor / $basePorMetro, 2);
    }

    /** Correlativo del documento, reutilizando el contador del sistema. */
    private function siguienteNumero(string $tipoDocumento, string $serie): string
    {
        $doc = SerieDocumento::where('tipo_documento', $tipoDocumento)
            ->where('serie', $serie)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => $tipoDocumento, 'serie' => $serie],
                ['numero_actual' => 0, 'activo' => true],
            );

        $doc->increment('numero_actual');

        return str_pad((string) $doc->numero_actual, 6, '0', STR_PAD_LEFT);
    }

    private function exigirTransicion(OrdenVenta $orden, string $destino): void
    {
        if (! $orden->puedePasarA($destino)) {
            $actual = OrdenVenta::ESTADOS[$orden->estado] ?? $orden->estado;
            $quiere = OrdenVenta::ESTADOS[$destino] ?? $destino;

            throw new \DomainException("Un pedido {$actual} no puede pasar a {$quiere}.");
        }
    }

    private function conRelaciones(OrdenVenta $orden): OrdenVenta
    {
        return $orden->load([
            'cliente', 'almacen', 'vendedor',
            'detalles.presentacion.producto',
            'detalles.rollos.rollo.color',
        ]);
    }
}
