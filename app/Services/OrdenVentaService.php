<?php

namespace App\Services;

use App\Models\NotaVenta;
use App\Models\OrdenVenta;
use App\Models\OrdenVentaDetalle;
use App\Models\ProductoAlmacenStock;
use App\Models\ProductoPresentacion;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Models\SerieDocumento;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * El recorrido del pedido, desde que se toma hasta que se factura.
 *
 *   borrador → solicitado → preparando → separado → despachado → facturado
 *                                                             ↘ anulado
 *
 * El stock se toca en dos momentos, y solo en dos:
 *
 *   - Al solicitar, lo pedido queda RESERVADO: sigue siendo stock físico,
 *     pero deja de estar disponible para otros clientes (100 m físicos,
 *     80 m disponibles).
 *   - Al despachar, la tela SALE: se cortan los rollos, se descuenta el
 *     almacén una sola vez y se libera la reserva. La proforma solo
 *     registra la venta y el cobro.
 *
 * El corte entre quién hace qué está en "solicitado": hasta ahí es del
 * vendedor, de ahí en adelante es del almacén.
 *
 * El vendedor pide producto y cantidad —"150 metros de Polinán negro"— porque
 * es lo único que puede saber. Qué rollos cubren esos metros, y desde qué
 * almacén, lo decide el almacenero escaneándolos: cada escaneo asigna un rollo
 * a la línea que le corresponde y descuenta de lo que falta.
 *
 * La tela también se pide en rollos enteros —"3 rollos de Polinán negro"— con
 * su precio por metro. El vendedor no sabe cuánto mide cada rollo: el pedido
 * nace sin metros ni importe y el almacén los define al separar. A medida que
 * escanea, cada rollo se cobra por sus metros reales. La nota lleva una fila
 * por rollo.
 */
class OrdenVentaService
{
    public function __construct(
        protected RolloService $rollos,
        protected NotaVentaService $notasVenta,
        protected StockService $stock,
        protected TipoCambioService $tiposCambio,
        protected AjusteRolloService $ajustesRollo,
    ) {}

    /**
     * Toma el pedido. Nace en borrador: todavía se le pueden agregar y quitar
     * líneas sin consecuencias, porque nada está comprometido.
     */
    public function crear(array $data): OrdenVenta
    {
        return DB::transaction(function () use ($data) {
            $orden = OrdenVenta::create($this->cabecera($data) + [
                // La serie dice de qué sucursal es el pedido: OV001-001 en el almacén 1, OV002-001 en el 2…
                'serie' => $serie = $data['serie'] ?? OrdenVenta::serieDeAlmacen($data['almacen_id'] ?? null),
                'numero' => $this->siguienteNumero('orden_venta', $serie, 3, $data['almacen_id'] ?? null),
                // La sucursal que toma el pedido: de ahí sale la mercadería.
                'almacen_id' => $data['almacen_id'] ?? null,
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
     * rack—, el pedido aparece en su bandeja y lo pedido queda reservado.
     * Qué rollos concretos se usan lo decide el almacén al prepararlo.
     */
    public function solicitar(OrdenVenta $orden): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::SOLICITADO);

        return DB::transaction(function () use ($orden) {
            if ($orden->detalles()->doesntExist()) {
                throw new \DomainException('El pedido no tiene productos: agrega al menos uno antes de solicitarlo.');
            }

            $this->reservarStock($orden);

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
            $this->liberarReservas($orden);
            $this->liberarRollos($orden, RolloMovimiento::CANCELACION);

            $orden->update([
                'estado' => OrdenVenta::BORRADOR,
                'fecha_separacion' => null,
                'fecha_preparacion' => null,
                'usuario_prepara_id' => null,
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
     * Quienes pueden trabajar pedidos en el almacén: los que tienen permiso de
     * despacho y el rol de administración. Son los que el encargado puede
     * elegir al repartir una tarea.
     *
     * @return \Illuminate\Support\Collection<int, array{id: int, name: string}>
     */
    public function almaceneros()
    {
        return User::orderBy('name')->get(['id', 'name'])
            ->filter(fn (User $u) => $u->hasRole(config('permisos.super_admin'))
                || $u->can('inventario.despacho.editar'))
            ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])
            ->values();
    }

    /**
     * El encargado reparte el pedido entre uno o varios almaceneros.
     *
     * Reemplaza el reparto anterior: quien queda fuera deja de verlo entre sus
     * tareas. Es coordinación, no un candado: cualquier almacenero con permiso
     * puede seguir escaneando, así una ausencia no deja el pedido parado.
     *
     * @param  list<int|string>  $usuarioIds  vacío = dejarlo sin asignar
     */
    public function asignar(OrdenVenta $orden, array $usuarioIds): OrdenVenta
    {
        if (! in_array($orden->estado, [OrdenVenta::SOLICITADO, OrdenVenta::PREPARANDO, OrdenVenta::SEPARADO], true)) {
            throw new \DomainException('Solo se pueden repartir los pedidos que están en el almacén.');
        }

        $ids = collect($usuarioIds)->map(fn ($id) => (int) $id)->unique()->values();

        if ($ids->diff($this->almaceneros()->pluck('id'))->isNotEmpty()) {
            throw new \DomainException('Solo se puede asignar a personal de almacén con permiso de despacho.');
        }

        DB::transaction(function () use ($orden, $ids) {
            $orden->asignados()->sync(
                $ids->mapWithKeys(fn ($id) => [$id => ['asignado_por_id' => auth()->id()]])->all()
            );
        });

        return $this->conRelaciones($orden->fresh());
    }

    /**
     * El almacenero terminó: los rollos están apartados y verificados.
     *
     * Siguen dentro del almacén —salen recién con el despacho—, pero ya no se
     * tocan: están en su sitio esperando a que el cliente pase a recogerlos.
     */
    public function marcarSeparado(OrdenVenta $orden, bool $parcial = false, ?string $saldo = null): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::SEPARADO);

        $orden->load('detalles.rollos');

        // Con `$parcial` se separa solo lo escaneado aunque falte algo (no se encontró un rollo, no hay más): hay que
        // decir qué pasa con lo que falta (`$saldo`): 'pendiente' (nace otro pedido con esa diferencia) o 'cancelar'
        // (el cliente ya no lo necesita). Se aplica al despachar; mientras tanto no se pierde nada de lo preparado.
        if ($orden->estaVerificada()) {
            $saldo = null;
        } elseif ($parcial) {
            if (! in_array($saldo, ['pendiente', 'cancelar'], true)) {
                throw new \DomainException('Elige qué pasa con lo que falta: dejarlo pendiente o cancelarlo.');
            }
            if (! $orden->detalles->contains(fn ($d) => $d->rollos->isNotEmpty())) {
                throw new \DomainException('Escanea al menos un rollo antes de entregar lo que hay. Si el cliente ya no quiere nada, anula el pedido.');
            }
        } else {
            $faltanRollos = $orden->detalles->filter->esPorRollos()->sum(fn ($d) => $d->rollosPendientes());
            $faltanMetros = $orden->detalles->reject->esPorRollos()->sum(fn ($d) => $d->metrosPendientes());
            $partes = array_filter([
                $faltanRollos > 0 ? $faltanRollos.($faltanRollos === 1 ? ' rollo' : ' rollos') : null,
                $faltanMetros > 0 ? round($faltanMetros, 2).' m' : null,
            ]);

            throw new \DomainException('Faltan '.implode(' y ', $partes).' por cubrir antes de darlo por separado.');
        }

        return DB::transaction(function () use ($orden, $saldo) {
            $orden->update([
                'estado' => OrdenVenta::SEPARADO,
                'fecha_separacion' => now(),
                'saldo_accion' => $saldo,
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
        $rollo = Rollo::with('producto', 'color')->where('codigo', $codigo)->first();

        if (! $rollo) {
            throw new \DomainException("No existe ningún rollo con el código {$codigo}.");
        }

        if (! $rollo->estaDisponible()) {
            $estado = strtolower(Rollo::ESTADOS[$rollo->estado] ?? $rollo->estado);
            throw new \DomainException("El rollo {$codigo} está {$estado}: no se puede usar.");
        }

        // Con el pedido ya en preparación, todos los rollos salen del mismo almacén.
        if ($orden->almacen_id && (int) $orden->almacen_id !== (int) $rollo->almacen_id) {
            throw new \DomainException(
                "El rollo {$codigo} está en otro almacén: este pedido se está preparando desde {$orden->almacen?->nombre}."
            );
        }

        $orden->load('detalles.rollos', 'detalles.presentacion', 'detalles.color');

        // Ya escaneado en esta orden: se avisa antes de nada, sea cual sea la
        // línea a la que se intente sumar.
        $yaEsta = $orden->detalles->contains(fn ($d) => $d->rollos->contains('rollo_id', $rollo->id));
        if ($yaEsta) {
            throw new \DomainException("El rollo {$codigo} ya está asignado a este pedido.");
        }

        $delMismoProducto = $orden->detalles->filter(
            fn ($d) => ! $d->estaCubierta() && (int) $d->presentacion?->producto_id === (int) $rollo->producto_id
        );

        if ($delMismoProducto->isEmpty()) {
            throw new \DomainException(
                "El rollo {$codigo} es de {$rollo->producto?->nombre}, que no falta en el requerimiento {$orden->requerimiento_numero}."
            );
        }

        // De las líneas de esa tela, la que pide el color de este rollo (o la
        // que no especificó color, si el rollo tampoco tiene). El color del
        // pedido manda: un rollo Negro no puede cubrir una línea de Azul.
        $linea = $delMismoProducto->first(
            fn ($d) => (int) $d->producto_color_id === (int) $rollo->producto_color_id
        ) ?? $delMismoProducto->first(fn ($d) => ! $d->producto_color_id);

        if (! $linea) {
            $colorPedido = $delMismoProducto->first()->color?->nombre;
            $colorRollo = $rollo->color?->nombre ?? 'sin color';

            throw new \DomainException(
                "El rollo {$codigo} es {$colorRollo}, pero el requerimiento {$orden->requerimiento_numero} pide "
                . ($colorPedido ? "{$rollo->producto?->nombre} {$colorPedido}." : "otro color de {$rollo->producto?->nombre}.")
            );
        }

        return DB::transaction(function () use ($orden, $linea, $rollo, $codigo) {
            // El primer escaneo fija el almacén y pone el pedido en preparación.
            // Recién aquí, con el rollo ya validado: un escaneo rechazado (otra
            // tela, otro color, repetido) no debe dejar el pedido tocado ni con
            // el almacén del rollo equivocado.
            if ($orden->estado === OrdenVenta::SOLICITADO) {
                $orden = $this->empezarPreparacion($orden, $rollo->almacen_id);
            }

            // Por rollos, el rollo sale entero, mida lo que mida. Si se pidió un metraje ("1 rollo de 50 m"), sale esa
            // medida: el rollo de justo ese largo se va entero y, si es más grande, se le corta la tela. Por metros
            // se toma lo que falte, sin pasarse de lo que da el rollo.
            $metrosRollo = (float) $rollo->metros_actual;
            $pedido = $linea->esPorRollos() && $linea->metros_por_rollo ? (float) $linea->metros_por_rollo : null;
            if ($pedido !== null && $metrosRollo + 0.01 < $pedido) {
                throw new \DomainException(
                    "El rollo {$codigo} tiene {$metrosRollo} m y el pedido pide rollos de {$pedido} m: busca uno de ese largo o más grande para cortarlo."
                );
            }
            $metros = $pedido ?? ($linea->esPorRollos() ? $metrosRollo : min($linea->metrosPendientes(), $metrosRollo));

            $linea->rollos()->create([
                'rollo_id' => $rollo->id,
                'metros' => $metros,
                'metros_rollo' => $metrosRollo,
                'entero' => $metros + 0.001 >= $metrosRollo,
                'escaneado_at' => now(),
                'usuario_escanea_id' => auth()->id(),
            ]);

            // El pedido se cobra con los metros reales de lo que ya se escaneó.
            $this->revalorizar($linea);
            $this->recalcularTotales($orden);

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
                'entero' => $metros + 0.001 >= $metrosRollo,
                'producto' => $rollo->producto?->nombre,
                'verificados' => $avance['asignados'],
                'total' => $avance['pedidos'],
                'rollos_asignados' => $avance['rollos_asignados'],
                'rollos_pedidos' => $avance['rollos_pedidos'],
                'completo' => $orden->estaVerificada(),
            ];
        });
    }

    /**
     * Descuenta metros de un rollo que ya está en el pedido, como un ajuste de sistema con su motivo
     * (el rollo se queda en el pedido con menos metros; no se quita). El pedido se cobra y se
     * despacha con los metros que quedan.
     */
    public function descontarMetraje(OrdenVenta $orden, int $rolloId, float $metros, string $motivo, ?string $observaciones = null): OrdenVenta
    {
        if (! in_array($orden->estado, [OrdenVenta::PREPARANDO, OrdenVenta::SEPARADO], true)) {
            throw new \DomainException('Solo se puede descontar metraje mientras el pedido se prepara.');
        }

        $metros = round($metros, 2);
        if ($metros <= 0) {
            throw new \DomainException('Pon cuántos metros descontar.');
        }

        return DB::transaction(function () use ($orden, $rolloId, $metros, $motivo, $observaciones) {
            $orden->load('detalles.rollos.rollo');

            $linea = $orden->detalles->first(fn ($d) => $d->rollos->contains('rollo_id', $rolloId));
            $asignado = $linea?->rollos->firstWhere('rollo_id', $rolloId);
            if (! $linea || ! $asignado) {
                throw new \DomainException('Ese rollo no está en este pedido.');
            }

            $rollo = Rollo::lockForUpdate()->findOrFail($rolloId);
            if ($metros >= (float) $rollo->metros_actual) {
                throw new \DomainException(
                    "El rollo {$rollo->codigo} tiene {$rollo->metros_actual} m: no se pueden descontar {$metros} m (si no sirve, quítalo del pedido)."
                );
            }

            $this->ajustesRollo->descontar(
                $rollo,
                $metros,
                $motivo,
                trim("Preparación del pedido ".($orden->requerimiento_numero ?? $orden->documento).". ".($observaciones ?? '')),
            );

            // El pedido sigue con ese rollo, pero con lo que ahora mide: lo que se llevaba entero se lleva
            // entero con los metros que quedan; un corte no puede pasar de lo que da el rollo.
            $rollo->refresh();
            $metrosRollo = (float) $rollo->metros_actual;
            $nuevos = $linea->esPorRollos() ? $metrosRollo : min((float) $asignado->metros, $metrosRollo);
            $asignado->update([
                'metros' => $nuevos,
                'metros_rollo' => $metrosRollo,
                'entero' => $nuevos + 0.001 >= $metrosRollo,
            ]);

            $this->revalorizar($linea);
            $this->recalcularTotales($orden);

            // Con menos metros puede que ya no esté cubierto lo pedido: vuelve a preparación.
            $orden->load('detalles.rollos');
            if ($orden->estado === OrdenVenta::SEPARADO && ! $orden->estaVerificada() && ! $orden->saldo_accion) {
                $orden->update(['estado' => OrdenVenta::PREPARANDO]);
            }

            return $this->conRelaciones($orden->fresh());
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
                $quitados = $linea->rollos->where('rollo_id', $rolloId);
                foreach ($quitados as $asignado) {
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
                if ($quitados->isNotEmpty()) {
                    $this->revalorizar($linea);
                }
            }
            $this->recalcularTotales($orden);

            // Si se sacó un rollo, el pedido ya no está completo.
            if ($orden->estado === OrdenVenta::SEPARADO) {
                $orden->update(['estado' => OrdenVenta::PREPARANDO, 'saldo_accion' => null]);
            }

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * El rollo que se había asignado no aparece en el rack. Sale del pedido —los demás rollos se conservan— y queda
     * bloqueado "en revisión": no se vuelve a ofrecer como disponible mientras alguien lo busca. Si se confirma que se
     * perdió, el ajuste de inventario se registra aparte (Stock por rollo); eso no frena la entrega del pedido.
     * Para reemplazarlo basta escanear otro rollo.
     */
    public function rolloNoEncontrado(OrdenVenta $orden, int $rolloId, ?string $observaciones = null): OrdenVenta
    {
        if (! in_array($orden->estado, [OrdenVenta::PREPARANDO, OrdenVenta::SEPARADO], true)) {
            throw new \DomainException('Solo se puede marcar un rollo como no encontrado mientras el pedido se prepara.');
        }

        return DB::transaction(function () use ($orden, $rolloId, $observaciones) {
            $orden->load('detalles.rollos.rollo');

            $quitado = false;
            foreach ($orden->detalles as $linea) {
                $asignados = $linea->rollos->where('rollo_id', $rolloId);
                foreach ($asignados as $asignado) {
                    if ($asignado->rollo) {
                        $this->rollos->cambiarEstado(
                            $asignado->rollo,
                            Rollo::EN_REVISION,
                            RolloMovimiento::REVISION,
                            'orden_venta',
                            $orden->id,
                            null,
                            trim('No se encontró al preparar el pedido '.($orden->requerimiento_numero ?? $orden->documento).'. '.($observaciones ?? '')),
                        );
                    }
                    $asignado->delete();
                    $quitado = true;
                }
                if ($asignados->isNotEmpty()) {
                    $this->revalorizar($linea);
                }
            }

            if (! $quitado) {
                throw new \DomainException('Ese rollo no está en este pedido.');
            }

            $this->recalcularTotales($orden);

            if ($orden->estado === OrdenVenta::SEPARADO) {
                $orden->update(['estado' => OrdenVenta::PREPARANDO, 'saldo_accion' => null]);
            }

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * El cliente ya no necesita todo lo pedido: se baja la cantidad de una línea (solo lo que aún no está preparado),
     * sin anular el pedido ni soltar los rollos ya separados. En rollos, `$cantidad` son rollos; en metros, metros.
     */
    public function reducirCantidad(OrdenVenta $orden, int $detalleId, float $cantidad): OrdenVenta
    {
        if (! in_array($orden->estado, [OrdenVenta::PREPARANDO, OrdenVenta::SEPARADO], true)) {
            throw new \DomainException('Solo se puede reducir lo pedido mientras el pedido se prepara.');
        }

        return DB::transaction(function () use ($orden, $detalleId, $cantidad) {
            $orden->load('detalles.rollos', 'detalles.presentacion', 'detalles.almacenReserva');

            $linea = $orden->detalles->firstWhere('id', $detalleId);
            if (! $linea) {
                throw new \DomainException('Esa línea no es de este pedido.');
            }

            $cantidad = $linea->esPorRollos() ? (float) (int) round($cantidad) : round($cantidad, 2);
            $pedido = $linea->esPorRollos() ? (float) $linea->rollos_pedidos : (float) $linea->metros;
            $listo = $linea->esPorRollos() ? (float) $linea->rollosAsignados() : $linea->metrosAsignados();
            $unidad = $linea->esPorRollos() ? 'rollos' : 'm';

            if ($cantidad > $pedido + 0.001) {
                throw new \DomainException('Solo se puede reducir lo pedido, no aumentarlo.');
            }
            if ($cantidad + 0.001 < $listo) {
                throw new \DomainException("Ya hay {$listo} {$unidad} preparados: no se puede bajar de ahí. Si sobran, quita primero esos rollos.");
            }
            if ($cantidad <= 0 && $orden->detalles->count() === 1) {
                throw new \DomainException('Un pedido necesita al menos un producto. Si el cliente ya no quiere nada, anula el pedido.');
            }

            $this->reducirLinea($linea, $cantidad);
            $this->recalcularTotales($orden);

            return $this->conRelaciones($orden->fresh());
        });
    }

    /**
     * La tela sale físicamente del almacén.
     *
     * Ya viene verificada de "separado". Aquí se cortan los metros de cada
     * rollo asignado, se descuenta el stock una sola vez y se libera la
     * reserva que dejó el vendedor al solicitar.
     */
    public function despachar(OrdenVenta $orden): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::DESPACHADO);

        return DB::transaction(function () use ($orden) {
            if ($orden->saldo_accion) {
                $this->aplicarSaldo($orden);
            }

            $this->liberarReservas($orden);

            $orden->load('detalles.rollos.rollo', 'detalles.presentacion', 'almacen');

            if (! $orden->almacen) {
                throw new \DomainException('El pedido no tiene almacén de salida: prepáralo escaneando sus rollos.');
            }

            foreach ($orden->detalles as $linea) {
                foreach ($linea->rollos as $asignado) {
                    if (! $asignado->rollo) {
                        continue;
                    }

                    $this->rollos->cortar(
                        $asignado->rollo,
                        (float) $asignado->metros,
                        RolloMovimiento::DESPACHO,
                        'orden_venta',
                        $orden->id,
                    );

                    $rollo = $asignado->rollo->fresh();

                    // Lo que sobra del rollo sigue en el almacén con su mismo
                    // código; si salió entero, se va con el pedido.
                    $this->rollos->cambiarEstado(
                        $rollo,
                        (float) $rollo->metros_actual > 0 ? Rollo::DISPONIBLE : Rollo::DESPACHADO,
                        RolloMovimiento::DESPACHO,
                        'orden_venta',
                        $orden->id,
                    );
                }

                try {
                    $this->stock->salida(
                        $linea->presentacion,
                        $orden->almacen,
                        $linea->cantidadDespachada(),
                        0,
                        'despacho_pedido',
                        'orden_venta',
                        $orden->id,
                        auth()->id(),
                        null,
                        $linea->producto_color_id,
                    );
                } catch (\RuntimeException $e) {
                    throw new \DomainException($e->getMessage());
                }
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
     * Cierra el pedido: emite la proforma y registra el cobro.
     *
     * La tela ya salió al despachar, así que aquí no se descuenta nada más:
     * solo los rollos que se fueron enteros quedan como vendidos y con dueño.
     *
     * @param  array{tipo_pago?: string, pagos?: list<array>, fecha_emision?: string, serie?: string}  $datos
     */
    public function facturar(OrdenVenta $orden, array $datos = []): NotaVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::FACTURADO);

        // Una línea con el precio por confirmar no se factura en blanco: hay
        // que saber el metraje real del rollo y poner el precio antes.
        if ($orden->detalles()->where('precio_oculto', true)->exists()) {
            throw new \DomainException(
                'Hay líneas con el precio por confirmar: complétalo antes de facturar.'
            );
        }

        return DB::transaction(function () use ($orden, $datos) {
            $orden->load(['detalles.rollos.rollo', 'detalles.presentacion.unidadBase', 'detalles.presentacion.producto.presentaciones.unidadBase']);

            // Una fila por rollo, con sus metros reales: los totales salen de ahí.
            $detalles = $this->detallesParaNota($orden);
            $descuentos = round(collect($detalles)->sum('descuento'), 2);
            $total = round(collect($detalles)->sum('subtotal'), 2);

            $nota = $this->notasVenta->crear([
                'serie' => $datos['serie'] ?? \App\Models\NotaVenta::serieDeAlmacen($orden->almacen_id),
                'orden_venta_id' => $orden->id,
                'cliente_id' => $orden->cliente_id,
                'almacen_id' => $orden->almacen_id,
                'vendedor_id' => $orden->vendedor_id,
                'fecha_emision' => $datos['fecha_emision'] ?? now()->toDateString(),
                'moneda' => $orden->moneda,
                // El de la fecha de la venta; si no hay, el del pedido.
                'tipo_cambio' => $orden->moneda === 'USD'
                    ? ($this->tiposCambio->venta($datos['fecha_emision'] ?? null) ?? (float) $orden->tipo_cambio)
                    : null,
                'tipo_pago' => $datos['tipo_pago'] ?? 'contado',
                'cuotas' => $datos['cuotas'] ?? [],
                'autorizar_exceso' => (bool) ($datos['autorizar_exceso'] ?? false),
                'subtotal' => round($total + $descuentos, 2),
                'descuento_total' => $descuentos,
                'total' => $total,
                'observaciones' => "Pedido {$orden->documento}",
                'detalles' => $detalles,
                'pagos' => $datos['pagos'] ?? [],
            ]);

            foreach ($orden->detalles as $linea) {
                foreach ($linea->rollos as $asignado) {
                    $rollo = $asignado->rollo;

                    if (! $rollo || $rollo->estado !== Rollo::DESPACHADO) {
                        continue;
                    }

                    $this->rollos->cambiarEstado(
                        $rollo,
                        Rollo::VENDIDO,
                        RolloMovimiento::VENTA,
                        'nota_venta',
                        $nota->id,
                    );

                    $rollo->update(['cliente_id' => $orden->cliente_id]);
                }
            }

            $orden->update(['estado' => OrdenVenta::FACTURADO]);

            return $nota->fresh(['detalles.rollo', 'cliente', 'almacen']);
        });
    }

    /**
     * Traduce las líneas del pedido a líneas de proforma.
     *
     * La nota se lleva la cantidad tal como se pidió, en la unidad de su
     * presentación: es lo que descuenta el stock y lo que ve el cliente.
     *
     * @return list<array<string, mixed>>
     */
    private function detallesParaNota(OrdenVenta $orden): array
    {
        $filas = [];

        foreach ($orden->detalles as $linea) {
            $asignados = $linea->rollos->values();

            // Lo que no sale de rollos (un hilo, un cierre) va como se pidió.
            if ($asignados->isEmpty()) {
                $filas[] = [
                    'producto_presentacion_id' => $linea->producto_presentacion_id,
                    'rollo_id' => null,
                    'cantidad' => (float) $linea->cantidad,
                    'precio_unitario' => (float) $linea->precio_unitario,
                    'descuento' => (float) $linea->descuento,
                    'subtotal' => (float) $linea->subtotal,
                ];

                continue;
            }

            // La tela: una fila por rollo, con sus metros reales al precio del
            // metro. Las filas suman justo lo de la línea: la última se queda
            // con los céntimos del redondeo y con el descuento, si lo hay.
            $metro = $linea->presentacion->producto?->presentacionMetro() ?? $linea->presentacion;
            $porMetro = $this->precioPorMetro($linea);
            $bruto = round((float) $linea->subtotal + (float) $linea->descuento, 2);
            $ultima = $asignados->count() - 1;
            $acumulado = 0.0;

            foreach ($asignados as $i => $asignado) {
                $metros = (float) $asignado->metros;
                $importe = $i === $ultima ? round($bruto - $acumulado, 2) : round($metros * $porMetro, 2);
                $acumulado += $importe;
                $descuento = $i === $ultima ? (float) $linea->descuento : 0.0;

                $filas[] = [
                    'producto_presentacion_id' => $metro->id,
                    'rollo_id' => $asignado->rollo_id,
                    'metros_rollo' => $asignado->metros_rollo !== null ? (float) $asignado->metros_rollo : $metros,
                    'rollo_entero' => (bool) $asignado->entero,
                    'cantidad' => $metro->desdeMetros($metros),
                    'precio_unitario' => round($porMetro, 2),
                    'descuento' => $descuento,
                    'subtotal' => round($importe - $descuento, 2),
                ];
            }
        }

        return $filas;
    }

    /**
     * El precio de un metro de esa línea, sin redondear. Si se pidió por metro
     * es el mismo; si en un formato de varios metros (un "Rollo 50 m"), su parte.
     */
    private function precioPorMetro(OrdenVentaDetalle $linea): float
    {
        $metros = $linea->presentacion->aMetros(1);

        return $metros > 0 ? (float) $linea->precio_unitario / $metros : (float) $linea->precio_unitario;
    }

    /**
     * Valoriza una línea pedida en rollos con lo que el almacén ya asignó: cada
     * rollo a sus metros reales (redondeado igual que en la nota). Lo que falta
     * no se estima: se suma al escanearlo. Una línea por metros no cambia: el
     * cliente pidió esos metros a ese precio, salgan de uno o de varios rollos.
     */
    private function revalorizar(OrdenVentaDetalle $linea): void
    {
        if (! $linea->esPorRollos()) {
            return;
        }

        $linea->load('rollos', 'presentacion.unidadBase', 'presentacion.producto.presentaciones.unidadBase');

        $precio = $this->precioPorMetro($linea);
        $metros = (float) $linea->rollos->sum('metros');

        $linea->update([
            'cantidad' => round($linea->presentacion->desdeMetros($metros), 2),
            'metros' => round($metros, 2),
            'subtotal' => round(
                $linea->rollos->sum(fn ($r) => round((float) $r->metros * $precio, 2)) - (float) $linea->descuento,
                2,
            ),
        ]);
    }

    /** Los totales del pedido, sumando sus líneas (las de precio por confirmar no cuentan). */
    private function recalcularTotales(OrdenVenta $orden): void
    {
        $lineas = $orden->detalles()->where('precio_oculto', false)->get(['subtotal', 'descuento']);
        $descuentos = round((float) $lineas->sum('descuento'), 2);
        $total = round((float) $lineas->sum('subtotal'), 2);

        $orden->update([
            'subtotal' => round($total + $descuentos, 2),
            'descuento_total' => $descuentos,
            'total' => $total,
        ]);
    }

    /**
     * Deja una línea en `$nuevo` (rollos o metros según su modo): lo que sobra se quita de lo pedido y de su reserva. Una
     * línea que queda en cero sin nada preparado desaparece.
     */
    private function reducirLinea(OrdenVentaDetalle $linea, float $nuevo): void
    {
        $linea->loadMissing('presentacion', 'almacenReserva');

        if ($linea->esPorRollos()) {
            if ($nuevo <= 0 && $linea->rollosAsignados() === 0) {
                $linea->delete();

                return;
            }
            $linea->update(['rollos_pedidos' => (int) $nuevo]);

            return;
        }

        $antes = (float) $linea->metros;
        $ratio = $antes > 0 ? max(0, $nuevo) / $antes : 0;

        // La reserva baja en la misma proporción (o se suelta entera si la línea desaparece).
        if ($linea->cantidad_reservada !== null && $linea->almacenReserva) {
            $reserva = (float) $linea->cantidad_reservada;
            $nuevaReserva = $nuevo <= 0 ? 0.0 : round($reserva * $ratio, 2);
            if ($reserva - $nuevaReserva > 0) {
                $this->stock->liberarReserva($linea->presentacion, $linea->almacenReserva, $reserva - $nuevaReserva);
            }
            $linea->cantidad_reservada = $nuevaReserva > 0 ? $nuevaReserva : null;
            if ($nuevaReserva <= 0) {
                $linea->reserva_almacen_id = null;
            }
        }

        if ($nuevo <= 0 && $linea->metrosAsignados() <= 0) {
            $linea->save();
            $linea->delete();

            return;
        }

        $cantidad = round((float) $linea->cantidad * $ratio, 2);
        $descuento = round((float) $linea->descuento * $ratio, 2);
        $linea->fill([
            'metros' => round($nuevo, 2),
            'cantidad' => $cantidad,
            'descuento' => $descuento,
            'subtotal' => round($cantidad * (float) $linea->precio_unitario - $descuento, 2),
        ])->save();
    }

    /**
     * Al despachar una entrega parcial: lo pedido de cada línea queda igual a lo que sale, lo que faltó se anota y, si
     * se decidió dejarlo pendiente, nace otro pedido (ya solicitado, en la bandeja del almacén) con esa diferencia.
     * No exige que haya rollos libres: justamente es lo que no se pudo cubrir.
     */
    private function aplicarSaldo(OrdenVenta $orden): void
    {
        $orden->load('detalles.rollos', 'detalles.presentacion', 'detalles.color', 'detalles.almacenReserva');

        $saldo = [];
        $resumen = [];
        foreach ($orden->detalles as $linea) {
            if ($linea->estaCubierta()) {
                continue;
            }

            $nombre = trim(($linea->presentacion?->producto?->nombre ?? 'Producto').($linea->color ? ' · '.$linea->color->nombre : ''));

            if ($linea->esPorRollos()) {
                $faltan = $linea->rollosPendientes();
                $saldo[] = [
                    'modo' => OrdenVentaDetalle::MODO_ROLLOS,
                    'producto_presentacion_id' => $linea->producto_presentacion_id,
                    'producto_color_id' => $linea->producto_color_id,
                    'rollos_pedidos' => $faltan,
                    'metros_por_rollo' => $linea->metros_por_rollo,
                    'cantidad' => 0,
                    'metros' => 0,
                    'precio_unitario' => $linea->precio_unitario,
                    'descuento' => 0,
                    'subtotal' => 0,
                    'precio_oculto' => $linea->precio_oculto,
                    'descripcion' => $linea->descripcion,
                ];
                $resumen[] = "{$nombre}: {$faltan} ".($faltan === 1 ? 'rollo' : 'rollos');
                $this->reducirLinea($linea, (float) $linea->rollosAsignados());
            } else {
                $faltan = $linea->metrosPendientes();
                $ratio = (float) $linea->metros > 0 ? $faltan / (float) $linea->metros : 0;
                $cantidad = round((float) $linea->cantidad * $ratio, 2);
                $descuento = round((float) $linea->descuento * $ratio, 2);
                $saldo[] = [
                    'modo' => OrdenVentaDetalle::MODO_METROS,
                    'producto_presentacion_id' => $linea->producto_presentacion_id,
                    'producto_color_id' => $linea->producto_color_id,
                    'rollos_pedidos' => null,
                    'metros_por_rollo' => null,
                    'cantidad' => $cantidad,
                    'metros' => $faltan,
                    'precio_unitario' => $linea->precio_unitario,
                    'descuento' => $descuento,
                    'subtotal' => round($cantidad * (float) $linea->precio_unitario - $descuento, 2),
                    'precio_oculto' => $linea->precio_oculto,
                    'descripcion' => $linea->descripcion,
                ];
                $resumen[] = "{$nombre}: ".round($faltan, 2).' m';
                $this->reducirLinea($linea, $linea->metrosAsignados());
            }
        }

        if ($orden->saldo_accion === 'pendiente' && $saldo) {
            $hijo = OrdenVenta::create([
                'serie' => $serie = OrdenVenta::serieDeAlmacen($orden->almacen_id),
                'numero' => $this->siguienteNumero('orden_venta', $serie, 3, $orden->almacen_id),
                'cliente_id' => $orden->cliente_id,
                'almacen_id' => $orden->almacen_id,
                'vendedor_id' => $orden->vendedor_id,
                'fecha_emision' => now()->toDateString(),
                'fecha_entrega' => $orden->fecha_entrega,
                'moneda' => $orden->moneda,
                'tipo_cambio' => $orden->tipo_cambio,
                'observaciones' => 'Saldo de '.$orden->documento,
                // Ya está pedido y pendiente de preparar: aparece en la bandeja del almacén.
                'estado' => OrdenVenta::SOLICITADO,
                'requerimiento_numero' => 'RA-'.$this->siguienteNumero('requerimiento_almacen', 'RA'),
                'orden_origen_id' => $orden->id,
            ]);
            foreach ($saldo as $fila) {
                $hijo->detalles()->create($fila);
            }
            $this->recalcularTotales($hijo);
        }

        $this->recalcularTotales($orden);
        $orden->update(['saldo_detalle' => implode('; ', $resumen) ?: null]);
        $orden->unsetRelation('detalles');
    }

    /**
     * Anula el pedido: suelta la reserva y los rollos asignados. Si ya se
     * había despachado, la tela vuelve a sus rollos y al stock del almacén.
     */
    public function anular(OrdenVenta $orden, string $motivo): OrdenVenta
    {
        $this->exigirTransicion($orden, OrdenVenta::ANULADO);

        return DB::transaction(function () use ($orden, $motivo) {
            if ($orden->estado === OrdenVenta::DESPACHADO) {
                $this->revertirDespacho($orden);
            }

            $this->liberarReservas($orden);
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

    /**
     * Aparta lo pedido en el almacén que más disponible tenga de cada
     * producto. Desde este momento esos metros siguen siendo stock físico,
     * pero nadie más puede venderlos.
     */
    private function reservarStock(OrdenVenta $orden): void
    {
        $orden->load('detalles.presentacion.producto');

        foreach ($orden->detalles as $linea) {
            // Lo pedido en rollos no reserva metros —no se sabe cuánto miden—:
            // se comprueba que haya rollos libres y cada uno se aparta al escanearlo.
            if ($linea->esPorRollos()) {
                $this->exigirRollosLibres($orden, $linea);

                continue;
            }

            // Un pedido que vuelve de preparación ya trae su reserva.
            if ($linea->cantidad_reservada !== null) {
                continue;
            }

            $presentacion = $linea->presentacion;
            $factor = (float) ($presentacion->factor_conversion ?: 1);
            $necesario = round((float) $linea->cantidad * $factor, 2);

            $stock = ProductoAlmacenStock::with('almacen')
                ->where('producto_id', $presentacion->producto_id)
                ->when($orden->almacen_id, fn ($q) => $q->where('almacen_id', $orden->almacen_id))
                ->orderByDesc('stock_disponible')
                ->first();

            if (! $stock || ! $stock->almacen || (float) $stock->stock_disponible + 0.001 < $necesario) {
                $producto = $presentacion->producto?->nombre ?? 'el producto';
                $disponible = $stock ? round((float) $stock->stock_disponible / $factor, 2) : 0;

                throw new \DomainException(
                    "No hay stock disponible para reservar {$linea->cantidad} x {$presentacion->nombre} de {$producto}: "
                    ."queda {$disponible} disponible."
                );
            }

            $this->stock->reservar($presentacion, $stock->almacen, (float) $linea->cantidad);

            $linea->update([
                'reserva_almacen_id' => $stock->almacen_id,
                'cantidad_reservada' => $linea->cantidad,
            ]);
        }
    }

    /**
     * Los rollos que se pueden prometer de una tela (y color): los disponibles
     * menos los que otros pedidos ya pidieron y el almacén aún no asigna.
     */
    public function rollosLibres(int $productoId, ?int $colorId, ?int $excluirOrdenId = null, ?int $almacenId = null, ?float $metrosMinimos = null): int
    {
        $disponibles = Rollo::where('producto_id', $productoId)
            ->when($colorId, fn ($q) => $q->where('producto_color_id', $colorId))
            // Si se pidió un metraje, sirven los rollos que midan eso o más (se cortan).
            ->when($metrosMinimos, fn ($q) => $q->where('metros_actual', '>=', $metrosMinimos - 0.01))
            // Un pedido es de un almacén: solo cuentan sus rollos.
            ->when($almacenId, fn ($q) => $q->where('almacen_id', $almacenId))
            ->where('estado', Rollo::DISPONIBLE)
            ->where('metros_actual', '>', 0)
            ->count();

        $comprometidos = OrdenVentaDetalle::porAsignar()
            ->whereHas('presentacion', fn ($q) => $q->where('producto_id', $productoId))
            ->when($colorId, fn ($q) => $q->where('producto_color_id', $colorId))
            ->when($excluirOrdenId, fn ($q) => $q->where('orden_venta_id', '!=', $excluirOrdenId))
            // Y los pedidos que ya le piden rollos a ese mismo almacén.
            ->when($almacenId, fn ($q) => $q->whereHas('ordenVenta', fn ($o) => $o->where(fn ($w) => $w->where('almacen_id', $almacenId)->orWhereNull('almacen_id'))))
            ->with('rollos')
            ->get()
            ->sum(fn ($d) => $d->rollosPendientes());

        return max(0, $disponibles - $comprometidos);
    }

    /** Al solicitar: que los rollos pedidos existan y no estén ya prometidos a otro pedido. */
    private function exigirRollosLibres(OrdenVenta $orden, OrdenVentaDetalle $linea): void
    {
        $libres = $this->rollosLibres(
            (int) $linea->presentacion->producto_id,
            $linea->producto_color_id ? (int) $linea->producto_color_id : null,
            $orden->id,
            $orden->almacen_id ? (int) $orden->almacen_id : null,
            $linea->metros_por_rollo ? (float) $linea->metros_por_rollo : null,
        );

        // Los que ya escaneó el almacén (un pedido que vuelve de preparación) cuentan.
        $faltan = $linea->rollosPendientes();

        if ($libres < $faltan) {
            $tela = $linea->presentacion->producto?->nombre ?? 'la tela';
            $color = $linea->color?->nombre;

            throw new \DomainException(
                "No hay rollos libres de {$tela}".($color ? " {$color}" : '').": pides {$faltan} y quedan {$libres}."
            );
        }
    }

    /** Devuelve a disponible lo que el pedido tenía apartado. */
    private function liberarReservas(OrdenVenta $orden): void
    {
        $orden->load('detalles.presentacion', 'detalles.almacenReserva');

        foreach ($orden->detalles as $linea) {
            if ($linea->cantidad_reservada === null || ! $linea->almacenReserva) {
                continue;
            }

            $this->stock->liberarReserva($linea->presentacion, $linea->almacenReserva, (float) $linea->cantidad_reservada);

            $linea->update(['reserva_almacen_id' => null, 'cantidad_reservada' => null]);
        }
    }

    /** La tela que ya había salido vuelve: los metros a cada rollo y el stock al almacén. */
    private function revertirDespacho(OrdenVenta $orden): void
    {
        $orden->load('detalles.rollos.rollo', 'detalles.presentacion', 'almacen');

        foreach ($orden->detalles as $linea) {
            foreach ($linea->rollos as $asignado) {
                if ($asignado->rollo) {
                    $this->rollos->devolver(
                        $asignado->rollo,
                        (float) $asignado->metros,
                        RolloMovimiento::CANCELACION,
                        'orden_venta',
                        $orden->id,
                    );
                }
            }

            if ($orden->almacen) {
                $this->stock->entrada(
                    $linea->presentacion,
                    $orden->almacen,
                    $linea->cantidadDespachada(),
                    0,
                    'anulacion_despacho',
                    'orden_venta',
                    $orden->id,
                    auth()->id(),
                    null,
                    $linea->producto_color_id,
                );
            }
        }
    }

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

            // Sin sus rollos, la línea vuelve a valer lo estimado.
            if ($linea->rollos->isNotEmpty()) {
                $this->revalorizar($linea);
            }
        }

        $this->recalcularTotales($orden);
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
            // En dólares: el SUNAT venta del día, salvo que se ponga otro.
            'tipo_cambio' => ($data['moneda'] ?? 'PEN') === 'USD'
                ? ((float) ($data['tipo_cambio'] ?? 0) ?: $this->tiposCambio->venta($data['fecha_emision']))
                : null,
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

            // Una tela se pide en rollos enteros y se cobra por metro: la línea
            // va en su formato "Metro" con los rollos pedidos, sin metros ni
            // importe. Cuánto mide cada rollo lo define el almacén al separar.
            $porRollos = ($linea['modo'] ?? OrdenVentaDetalle::MODO_METROS) === OrdenVentaDetalle::MODO_ROLLOS;
            $rollosPedidos = null;
            if ($porRollos) {
                $producto = $presentacion->producto;
                if (! $producto?->esTela()) {
                    throw new \DomainException("\"{$producto?->nombre}\" no se vende por rollos.");
                }
                $presentacion = $producto->presentacionMetro();
                $rollosPedidos = max(1, (int) ($linea['rollos_pedidos'] ?? 0));
                $linea['cantidad'] = 0;
                $linea['descuento'] = 0;
            }

            $cantidad = round((float) $linea['cantidad'], 2);
            $precio = round((float) ($linea['precio_unitario'] ?? 0), 2);
            $descuento = round((float) ($linea['descuento'] ?? 0), 2);
            $importe = round($cantidad * $precio - $descuento, 2);
            // Con un rollo no se sabe el metraje real hasta pesarlo: el
            // precio es una estimación que no debe sumar al pedido.
            $precioOculto = (bool) ($linea['precio_oculto'] ?? false);

            $orden->detalles()->create([
                'producto_presentacion_id' => $presentacion->id,
                // Opcional: hay insumos que no se piden por color. Cuando sí
                // se especifica, el almacén solo puede cubrir la línea con
                // rollos de ese color.
                'producto_color_id' => $linea['producto_color_id'] ?? null,
                'modo' => $porRollos ? OrdenVentaDetalle::MODO_ROLLOS : OrdenVentaDetalle::MODO_METROS,
                'rollos_pedidos' => $rollosPedidos,
                'metros_por_rollo' => $porRollos && ! empty($linea['metros_por_rollo']) ? round((float) $linea['metros_por_rollo'], 2) : null,
                'cantidad' => $cantidad,
                'descripcion' => $linea['descripcion'] ?? null,
                'metros' => $this->aMetros($presentacion, $cantidad),
                'precio_unitario' => $precio,
                'descuento' => $descuento,
                'subtotal' => $importe,
                'precio_oculto' => $precioOculto,
            ]);

            if (! $precioOculto) {
                $subtotal += $cantidad * $precio;
                $descuentos += $descuento;
            }
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
    private function siguienteNumero(string $tipoDocumento, string $serie, int $largo = 6, ?int $almacenId = null): string
    {
        $doc = SerieDocumento::where('tipo_documento', $tipoDocumento)
            ->where('serie', $serie)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => $tipoDocumento, 'serie' => $serie],
                ['numero_actual' => 0, 'activo' => true, 'almacen_id' => $almacenId],
            );

        $doc->increment('numero_actual');

        return str_pad((string) $doc->numero_actual, $largo, '0', STR_PAD_LEFT);
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
            'detalles.almacenReserva',
            'detalles.rollos.rollo.color',
            'ordenSaldo:id,serie,numero,orden_origen_id',
            'ordenOrigen:id,serie,numero',
        ]);
    }
}
