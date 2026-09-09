<?php

namespace App\Services;

use App\Models\NotaVenta;
use App\Models\OrdenVenta;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Models\SerieDocumento;
use Illuminate\Support\Facades\DB;

/**
 * El recorrido del pedido, desde que se toma hasta que se factura.
 *
 * La regla que manda sobre todo lo demás: el pedido NO mueve stock. Los
 * rollos quedan marcados para que nadie más los venda, pero siguen contando
 * en el inventario porque físicamente están en el almacén. El descuento
 * ocurre una sola vez, cuando se emite la nota de venta.
 *
 *   borrador → pendiente → en_preparacion → despachada → facturada
 *                                                     ↘ anulada
 *
 * El corte entre quién hace qué está en "pendiente": hasta ahí es del
 * vendedor, de ahí en adelante es del almacén. El almacenero ve los pedidos
 * pendientes en su bandeja, los toma, baja los rollos del rack y los despacha.
 *
 * El estado de cada rollo va pegado al del pedido: nadie lo mueve a mano.
 */
class OrdenVentaService
{
    public function __construct(
        protected RolloService $rollos,
        protected NotaVentaService $notasVenta,
    ) {}

    /**
     * Toma el pedido. Nace en borrador: todavía se le pueden agregar y quitar
     * rollos sin consecuencias, porque nada está comprometido.
     *
     * @param  array{cliente_id?: int|null, almacen_id: int, vendedor_id: int, fecha_emision: string, detalles: list<array>}  $data
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
     * Cambia los rollos o los datos del pedido. Solo mientras es borrador:
     * después ya hay rollos comprometidos y el almacén trabajando sobre ellos.
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
     * El vendedor manda el pedido al almacén.
     *
     * Los rollos quedan reservados para este cliente en el mismo acto: si se
     * dejara para cuando el almacenero lo tome, otro vendedor podría venderlos
     * mientras el pedido espera en la bandeja.
     *
     * Aquí es donde se comprueba que los rollos sigan libres — entre que se
     * armó el pedido y se confirmó, otro vendedor pudo haberlos tomado.
     */
    public function enviarAlAlmacen(OrdenVenta $orden): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::PENDIENTE);

        return DB::transaction(function () use ($orden) {
            $orden->load('detalles.rollo');

            if ($orden->detalles->isEmpty()) {
                throw new \DomainException('El pedido no tiene rollos: agrega al menos uno antes de enviarlo al almacén.');
            }

            $tomados = [];

            foreach ($orden->detalles as $detalle) {
                // Se bloquea el rollo para que dos vendedores no se lo lleven
                // a la vez: gana el primero que llegue.
                $rollo = Rollo::lockForUpdate()->find($detalle->rollo_id);

                if (! $rollo || ! $rollo->estaDisponible()) {
                    $tomados[] = $rollo?->codigo ?? "#{$detalle->rollo_id}";
                    continue;
                }

                if ((float) $detalle->metros > (float) $rollo->metros_actual) {
                    throw new \DomainException(
                        "El rollo {$rollo->codigo} tiene {$rollo->metros_actual} m y el pedido pide {$detalle->metros} m."
                    );
                }

                $this->rollos->cambiarEstado(
                    $rollo,
                    Rollo::SEPARADO,
                    RolloMovimiento::SEPARACION,
                    'orden_venta',
                    $orden->id,
                );
            }

            if ($tomados) {
                throw new \DomainException(
                    'Estos rollos ya no están disponibles: '.implode(', ', $tomados).'.'
                );
            }

            $orden->update([
                'estado' => OrdenVenta::PENDIENTE,
                'fecha_separacion' => now(),
            ]);

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * El cliente no confirmó: los rollos vuelven a estar disponibles y el
     * pedido regresa a borrador para poder corregirlo.
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
            ]);

            // Lo que ya se escaneó deja de valer: el pedido puede cambiar.
            $orden->detalles()->update(['escaneado_at' => null, 'usuario_escanea_id' => null]);

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * El almacenero toma el pedido de su bandeja y empieza a prepararlo.
     *
     * Aquí se numera el requerimiento de almacén: es el papel con el que baja
     * al rack a separar físicamente los rollos, ordenado por ubicación.
     */
    public function enviarAPreparacion(OrdenVenta $orden): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::EN_PREPARACION);

        return DB::transaction(function () use ($orden) {
            $orden->load('detalles.rollo');

            foreach ($orden->detalles as $detalle) {
                $this->rollos->cambiarEstado(
                    $detalle->rollo,
                    Rollo::EN_PREPARACION,
                    RolloMovimiento::PREPARACION,
                    'orden_venta',
                    $orden->id,
                );
            }

            $orden->update([
                'estado' => OrdenVenta::EN_PREPARACION,
                'fecha_preparacion' => now(),
                'usuario_prepara_id' => auth()->id(),
                // El requerimiento se numera solo la primera vez: si el pedido
                // va y vuelve, el almacenero sigue viendo el mismo papel.
                'requerimiento_numero' => $orden->requerimiento_numero
                    ?: 'RA-'.$this->siguienteNumero('requerimiento_almacen', 'RA'),
            ]);

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * El almacenero escanea un rollo con la pistola. Si no corresponde al
     * pedido, se avisa: es la comprobación que evita despachar el rollo
     * equivocado.
     */
    public function escanear(OrdenVenta $orden, string $codigo): array
    {
        if ($orden->estado !== OrdenVenta::EN_PREPARACION) {
            throw new \DomainException('Solo se pueden escanear rollos de un pedido en preparación.');
        }

        $codigo = trim($codigo);

        $detalle = $orden->detalles()
            ->whereHas('rollo', fn ($q) => $q->where('codigo', $codigo))
            ->with('rollo')
            ->first();

        if (! $detalle) {
            $existe = Rollo::where('codigo', $codigo)->exists();

            throw new \DomainException($existe
                ? "El rollo {$codigo} no corresponde al requerimiento {$orden->requerimiento_numero}."
                : "No existe ningún rollo con el código {$codigo}.");
        }

        if (! $detalle->escaneado_at) {
            $detalle->update([
                'escaneado_at' => now(),
                'usuario_escanea_id' => auth()->id(),
            ]);
        }

        $total = $orden->detalles()->count();
        $verificados = $orden->detalles()->whereNotNull('escaneado_at')->count();

        return [
            'rollo' => $detalle->rollo->only(['id', 'codigo', 'metros_actual']),
            'metros' => (float) $detalle->metros,
            'verificados' => $verificados,
            'total' => $total,
            'completo' => $verificados === $total,
        ];
    }

    /**
     * Los rollos salen del almacén. Se exige haberlos escaneado todos: es el
     * punto del proceso que evita el error de despacho.
     */
    public function despachar(OrdenVenta $orden): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::DESPACHADA);

        if (! $orden->estaVerificada()) {
            $faltan = $orden->detalles()->whereNull('escaneado_at')->count();

            throw new \DomainException(
                "Faltan escanear {$faltan} rollo(s) antes de despachar."
            );
        }

        return DB::transaction(function () use ($orden) {
            $orden->load('detalles.rollo');

            foreach ($orden->detalles as $detalle) {
                $this->rollos->cambiarEstado(
                    $detalle->rollo,
                    Rollo::DESPACHADO,
                    RolloMovimiento::DESPACHO,
                    'orden_venta',
                    $orden->id,
                );
            }

            $orden->update([
                'estado' => OrdenVenta::DESPACHADA,
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
     * plata. Corta los metros de cada rollo, deja constancia de a qué cliente
     * se fue, y delega la nota en el servicio de siempre para que la venta se
     * registre igual que una de mostrador (caja, cuenta por cobrar, kardex).
     *
     * @param  array{tipo_pago?: string, pagos?: list<array>, fecha_emision?: string, serie?: string}  $datos
     */
    public function facturar(OrdenVenta $orden, array $datos = []): NotaVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::FACTURADA);

        return DB::transaction(function () use ($orden, $datos) {
            $orden->load(['detalles.rollo.producto.presentaciones.unidadBase', 'detalles.presentacion']);

            $fecha = $datos['fecha_emision'] ?? now()->toDateString();

            $nota = $this->notasVenta->crear([
                'serie' => $datos['serie'] ?? 'NV01',
                'orden_venta_id' => $orden->id,
                'cliente_id' => $orden->cliente_id,
                'almacen_id' => $orden->almacen_id,
                'vendedor_id' => $orden->vendedor_id,
                'fecha_emision' => $fecha,
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
            foreach ($orden->detalles as $detalle) {
                if (! $detalle->rollo) {
                    continue;
                }

                $this->rollos->cortar(
                    $detalle->rollo,
                    (float) $detalle->metros,
                    RolloMovimiento::VENTA,
                    'nota_venta',
                    $nota->id,
                );

                $rollo = $detalle->rollo->fresh();

                // Si quedó tela, el rollo vuelve al stock con su mismo código;
                // si salió entero, queda como vendido y con dueño.
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

            $orden->update(['estado' => OrdenVenta::FACTURADA]);

            return $nota->fresh(['detalles.rollo', 'cliente', 'almacen']);
        });
    }

    /**
     * Traduce las líneas del pedido —que están en metros— a líneas de nota de
     * venta, que van en unidades de la presentación porque así se descuenta
     * el stock.
     *
     * @return list<array<string, mixed>>
     */
    private function detallesParaNota(OrdenVenta $orden): array
    {
        return $orden->detalles->map(function ($detalle) {
            $producto = $detalle->rollo?->producto;

            // Desde ahora la presentación es obligatoria al crear el pedido;
            // los que se guardaron antes de esa regla caen en la del metro,
            // que es como se vende la tela por defecto.
            $presentacion = $detalle->presentacion ?? $producto?->presentaciones
                ->first(fn ($p) => strtolower($p->unidadBase?->abreviatura ?? '') === 'm');

            if (! $presentacion) {
                throw new \DomainException(
                    "El rollo {$detalle->rollo?->codigo} no tiene presentación de venta: no se puede facturar."
                );
            }

            // metros → unidad base (cm) → unidades de la presentación.
            $base = (float) $detalle->metros * ($producto?->factorBasePorMetro() ?? 1);
            $factor = (float) ($presentacion?->factor_conversion ?: 1);
            $cantidad = round($base / $factor, 2);

            return [
                'producto_presentacion_id' => $presentacion->id,
                'rollo_id' => $detalle->rollo_id,
                'cantidad' => $cantidad,
                // El precio del pedido es por metro; en la nota va por unidad
                // de presentación, para que el subtotal siga cuadrando.
                'precio_unitario' => $cantidad > 0 ? round((float) $detalle->subtotal / $cantidad, 2) : 0,
                'descuento' => (float) $detalle->descuento,
                'subtotal' => (float) $detalle->subtotal,
            ];
        })->all();
    }

    /**
     * Anula el pedido y devuelve los rollos al stock disponible.
     *
     * Un pedido facturado ya no se anula por aquí: eso se hace anulando la
     * nota de venta, que es la que movió el inventario y la plata.
     */
    public function anular(OrdenVenta $orden, string $motivo): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::ANULADA);

        return DB::transaction(function () use ($orden, $motivo) {
            $this->liberarRollos($orden, RolloMovimiento::CANCELACION, $motivo);

            $orden->update([
                'estado' => OrdenVenta::ANULADA,
                'motivo_anulacion' => $motivo,
                'usuario_anula_id' => auth()->id(),
                'fecha_anulacion' => now(),
            ]);

            return $this->conRelaciones($orden->fresh());
        });
    }

    /* ------------------------------------------------------------------ */

    /** Devuelve los rollos del pedido a disponible. */
    private function liberarRollos(OrdenVenta $orden, string $tipo, ?string $observacion = null): void
    {
        $orden->load('detalles.rollo');

        foreach ($orden->detalles as $detalle) {
            if (! $detalle->rollo) {
                continue;
            }

            // Un rollo agotado no vuelve a disponible: ya no queda tela.
            $destino = (float) $detalle->rollo->metros_actual > 0
                ? Rollo::DISPONIBLE
                : Rollo::AGOTADO;

            $this->rollos->cambiarEstado(
                $detalle->rollo,
                $destino,
                $tipo,
                'orden_venta',
                $orden->id,
                null,
                $observacion,
            );
        }
    }

    /** Columnas propias del pedido (sin serie, número ni estado). */
    private function cabecera(array $data): array
    {
        return [
            'cliente_id' => $data['cliente_id'] ?? null,
            'almacen_id' => $data['almacen_id'],
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
     * @param  list<array{rollo_id: int, metros: float, precio_unitario?: float, descuento?: float, producto_presentacion_id?: int|null}>  $detalles
     */
    private function sincronizarDetalles(OrdenVenta $orden, array $detalles): void
    {
        $orden->detalles()->delete();

        $subtotal = 0;
        $descuentos = 0;

        foreach ($detalles as $linea) {
            $metros = round((float) $linea['metros'], 2);
            $precio = round((float) ($linea['precio_unitario'] ?? 0), 2);
            $descuento = round((float) ($linea['descuento'] ?? 0), 2);
            $importe = round($metros * $precio - $descuento, 2);

            $orden->detalles()->create([
                'rollo_id' => $linea['rollo_id'],
                'producto_presentacion_id' => $linea['producto_presentacion_id'] ?? null,
                'metros' => $metros,
                'precio_unitario' => $precio,
                'descuento' => $descuento,
                'subtotal' => $importe,
            ]);

            $subtotal += $metros * $precio;
            $descuentos += $descuento;
        }

        $orden->update([
            'subtotal' => round($subtotal, 2),
            'descuento_total' => round($descuentos, 2),
            'total' => round($subtotal - $descuentos, 2),
        ]);
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
            'detalles.rollo.producto', 'detalles.rollo.color', 'detalles.presentacion',
        ]);
    }
}
