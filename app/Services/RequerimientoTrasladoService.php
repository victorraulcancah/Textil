<?php

namespace App\Services;

use App\Models\Almacen;
use App\Models\ProductoPresentacion;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Models\SerieDocumento;
use App\Models\Transferencia;
use App\Models\TransferenciaDetalle;
use Illuminate\Support\Facades\DB;

/**
 * Requerimiento de traslado: un almacén (destino) le pide mercadería a otro (origen).
 *
 *   solicitada → preparando → separada → en_transito → recibida
 *                      ↘ rechazada / cancelada
 *
 * El almacén pedido lo atiende como un despacho: escanea los rollos (pistola o cámara), los da por separados y los
 * despacha. Al despachar se genera la guía (T001-...) y los rollos cambian de almacén; el stock del destino entra
 * recién cuando éste confirma la recepción (`TransferenciaController::recibir`).
 */
class RequerimientoTrasladoService
{
    public const SOLICITADA = 'solicitada';
    public const PREPARANDO = 'preparando';
    public const SEPARADA = 'separada';

    public function __construct(
        private readonly RolloService $rollos,
        private readonly StockService $stock,
    ) {
    }

    /**
     * @param  array{almacen_origen_id: int, almacen_destino_id: int, observaciones?: ?string, detalles: list<array>}  $data
     */
    public function crear(array $data): Transferencia
    {
        return DB::transaction(function () use ($data) {
            $origen = Almacen::findOrFail($data['almacen_origen_id']);
            $serie = Transferencia::serieRequerimiento($origen);

            $transferencia = Transferencia::create([
                'requerimiento_serie' => $serie,
                'requerimiento_numero' => $this->siguienteNumero($serie, $origen->id),
                'almacen_origen_id' => $origen->id,
                'almacen_destino_id' => $data['almacen_destino_id'],
                'observaciones' => $data['observaciones'] ?? null,
                'estado' => self::SOLICITADA,
                'usuario_solicita_id' => auth()->id(),
                'fecha_solicitud' => now(),
            ]);

            $presentaciones = ProductoPresentacion::with('producto.presentaciones.unidadBase')
                ->whereIn('id', collect($data['detalles'])->pluck('producto_presentacion_id'))
                ->get()->keyBy('id');

            foreach ($data['detalles'] as $linea) {
                $presentacion = $presentaciones[$linea['producto_presentacion_id']] ?? null;
                if (! $presentacion) {
                    continue;
                }

                $modo = $linea['modo'] ?? 'cantidad';
                $fila = ['producto_color_id' => $linea['producto_color_id'] ?? null, 'cantidad_enviada' => 0];

                if ($modo === 'rollos' || $modo === 'metros') {
                    $producto = $presentacion->producto;
                    if (! $producto?->esTela()) {
                        throw new \DomainException("\"{$producto?->nombre}\" no se pide por rollos ni metros.");
                    }
                    $fila['producto_presentacion_id'] = $producto->presentacionMetro()?->id ?? $presentacion->id;
                    $fila['modo'] = $modo;
                    if ($modo === 'rollos') {
                        $fila['rollos_pedidos'] = max(1, (int) ($linea['rollos_pedidos'] ?? 0));
                        $fila['metros_por_rollo'] = ! empty($linea['metros_por_rollo']) ? round((float) $linea['metros_por_rollo'], 2) : null;
                    } else {
                        $fila['metros_pedidos'] = round((float) ($linea['metros_pedidos'] ?? 0), 2);
                        if ($fila['metros_pedidos'] <= 0) {
                            throw new \DomainException('Indica cuántos metros se piden.');
                        }
                    }
                } else {
                    $fila['producto_presentacion_id'] = $presentacion->id;
                    $fila['modo'] = 'cantidad';
                    $fila['cantidad_enviada'] = round((float) ($linea['cantidad'] ?? 0), 2);
                    if ($fila['cantidad_enviada'] <= 0) {
                        throw new \DomainException('Indica la cantidad que se pide.');
                    }
                }

                $transferencia->detalles()->create($fila);
            }

            return $this->cargar($transferencia);
        });
    }

    /** El almacenero escanea un rollo (misma lógica que el despacho de un pedido). */
    public function escanear(Transferencia $t, string $codigo): array
    {
        if (! in_array($t->estado, [self::SOLICITADA, self::PREPARANDO], true)) {
            throw new \DomainException('Solo se pueden escanear rollos de un requerimiento solicitado o en preparación.');
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
        if ((int) $rollo->almacen_id !== (int) $t->almacen_origen_id) {
            throw new \DomainException("El rollo {$codigo} no está en {$t->almacenOrigen?->nombre}: este requerimiento sale de ese almacén.");
        }

        $t->load('detalles.rollos', 'detalles.presentacion', 'detalles.color');

        if ($t->detalles->contains(fn ($d) => $d->rollos->contains('rollo_id', $rollo->id))) {
            throw new \DomainException("El rollo {$codigo} ya está asignado a este requerimiento.");
        }

        $delMismoProducto = $t->detalles->filter(
            fn ($d) => $d->esTela() && ! $d->estaCubierta() && (int) $d->presentacion?->producto_id === (int) $rollo->producto_id
        );
        if ($delMismoProducto->isEmpty()) {
            throw new \DomainException("El rollo {$codigo} es de {$rollo->producto?->nombre}, que no falta en el requerimiento {$t->requerimiento}.");
        }

        $linea = $delMismoProducto->first(fn ($d) => (int) $d->producto_color_id === (int) $rollo->producto_color_id)
            ?? $delMismoProducto->first(fn ($d) => ! $d->producto_color_id);

        if (! $linea) {
            $colorPedido = $delMismoProducto->first()->color?->nombre;
            $colorRollo = $rollo->color?->nombre ?? 'sin color';
            throw new \DomainException(
                "El rollo {$codigo} es {$colorRollo}, pero el requerimiento {$t->requerimiento} pide "
                .($colorPedido ? "{$rollo->producto?->nombre} {$colorPedido}." : "otro color de {$rollo->producto?->nombre}.")
            );
        }

        $metrosRollo = (float) $rollo->metros_actual;
        $pedido = $linea->esPorRollos() && $linea->metros_por_rollo ? (float) $linea->metros_por_rollo : null;
        if ($pedido !== null && $metrosRollo + 0.01 < $pedido) {
            throw new \DomainException(
                "El rollo {$codigo} tiene {$metrosRollo} m y se piden rollos de {$pedido} m: busca uno de ese largo o más grande para cortarlo."
            );
        }
        $metros = $pedido ?? ($linea->esPorRollos() ? $metrosRollo : min($linea->metrosPendientes(), $metrosRollo));

        return DB::transaction(function () use ($t, $linea, $rollo, $codigo, $metros, $metrosRollo) {
            if ($t->estado === self::SOLICITADA) {
                $t->update(['estado' => self::PREPARANDO]);
            }

            $linea->rollos()->create([
                'rollo_id' => $rollo->id,
                'metros' => $metros,
                'metros_rollo' => $metrosRollo,
                'entero' => $metros + 0.001 >= $metrosRollo,
                'escaneado_at' => now(),
                'usuario_escanea_id' => auth()->id(),
            ]);

            $this->rollos->cambiarEstado($rollo, Rollo::EN_PREPARACION, RolloMovimiento::PREPARACION, 'transferencia', $t->id);

            $t->load('detalles.rollos');

            return [
                'rollo' => ['id' => $rollo->id, 'codigo' => $codigo, 'metros_actual' => $metrosRollo],
                'metros' => $metros,
                'entero' => $metros + 0.001 >= $metrosRollo,
                'producto' => $rollo->producto?->nombre,
                'completo' => $this->estaCompleto($t),
            ];
        });
    }

    /** Saca un rollo asignado por error: vuelve a estar disponible. */
    public function quitarRollo(Transferencia $t, int $rolloId): Transferencia
    {
        if (! in_array($t->estado, [self::PREPARANDO, self::SEPARADA], true)) {
            throw new \DomainException('Solo se pueden quitar rollos mientras el requerimiento se prepara.');
        }

        return DB::transaction(function () use ($t, $rolloId) {
            $t->load('detalles.rollos.rollo');
            foreach ($t->detalles as $linea) {
                foreach ($linea->rollos->where('rollo_id', $rolloId) as $asignado) {
                    if ($asignado->rollo) {
                        $this->rollos->cambiarEstado($asignado->rollo, Rollo::DISPONIBLE, RolloMovimiento::CANCELACION, 'transferencia', $t->id);
                    }
                    $asignado->delete();
                }
            }
            if ($t->estado === self::SEPARADA) {
                $t->update(['estado' => self::PREPARANDO]);
            }

            return $this->cargar($t->fresh());
        });
    }

    /** Todo lo pedido está cubierto: queda a la espera de que lo recojan / lo envíen. */
    public function marcarSeparada(Transferencia $t): Transferencia
    {
        if (! in_array($t->estado, [self::SOLICITADA, self::PREPARANDO], true)) {
            throw new \DomainException('Solo se puede dar por separado un requerimiento en preparación.');
        }

        $t->load('detalles.rollos');
        if (! $this->estaCompleto($t)) {
            $faltanRollos = $t->detalles->filter->esPorRollos()->sum(fn ($d) => $d->rollosPendientes());
            $faltanMetros = $t->detalles->filter->esPorMetros()->sum(fn ($d) => $d->metrosPendientes());
            $partes = array_filter([
                $faltanRollos > 0 ? $faltanRollos.($faltanRollos === 1 ? ' rollo' : ' rollos') : null,
                $faltanMetros > 0 ? round($faltanMetros, 2).' m' : null,
            ]);
            throw new \DomainException('Faltan '.implode(' y ', $partes).' por cubrir antes de darlo por separado.');
        }

        $t->update(['estado' => self::SEPARADA, 'fecha_separacion' => now()]);

        return $this->cargar($t->fresh());
    }

    /**
     * Sale la mercadería: se genera la guía, los rollos cambian de almacén (los cortes se parten) y se descuenta el
     * stock del origen. Queda en tránsito hasta que el destino la reciba.
     */
    /**
     * @param  array  $transporte  motivo, fecha, transporte y observaciones de la guía
     * @param  list<array{producto_presentacion_id: int, producto_color_id?: ?int, cantidad_enviada: float}>  $extras
     *         lo que se agregó al requerimiento al armar el traslado: va por stock, igual que una guía directa
     */
    public function despachar(Transferencia $t, array $transporte = [], array $extras = []): Transferencia
    {
        if ($t->estado !== self::SEPARADA) {
            throw new \DomainException('Primero hay que dar el requerimiento por separado.');
        }

        return DB::transaction(function () use ($t, $transporte, $extras) {
            $escogidos = collect($extras)->flatMap(fn ($e) => collect($e['rollos_escaneados'] ?? [])->pluck('rollo_id'))->all();

            foreach ($extras as $extra) {
                $cantidad = $extra['cantidad_enviada'] ?? null;
                $filasEscaneadas = [];
                if (! empty($extra['rollos_escaneados'])) {
                    // Rollos escogidos escaneando: salen exactamente esos.
                    [$cantidad, $filasEscaneadas] = app(TrasladoRollosService::class)->prepararEscaneados(
                        ProductoPresentacion::with('producto')->findOrFail($extra['producto_presentacion_id']),
                        $extra['producto_color_id'] ?? null,
                        (int) $t->almacen_origen_id,
                        $extra['rollos_escaneados'],
                    );
                } elseif (! empty($extra['rollos'])) {
                    // "N rollos": se toman los más antiguos del color y se descuenta lo que pesan.
                    $cantidad = app(TrasladoRollosService::class)->cantidadDeRollos(
                        ProductoPresentacion::with('producto')->findOrFail($extra['producto_presentacion_id']),
                        $extra['producto_color_id'] ?? null,
                        (int) $t->almacen_origen_id,
                        (int) $extra['rollos'],
                        $escogidos,
                    );
                }

                $linea = $t->detalles()->create([
                    'producto_presentacion_id' => $extra['producto_presentacion_id'],
                    'producto_color_id' => $extra['producto_color_id'] ?? null,
                    'modo' => 'cantidad',
                    'cantidad_enviada' => $cantidad,
                ]);
                foreach ($filasEscaneadas as $fila) {
                    $linea->rollos()->create($fila);
                }
            }
            $t->unsetRelation('detalles');

            $t->load('detalles.rollos.rollo', 'detalles.presentacion.producto', 'almacenOrigen');
            $destinoId = (int) $t->almacen_destino_id;

            foreach ($t->detalles as $linea) {
                if ($linea->esTela()) {
                    foreach ($linea->rollos as $asignado) {
                        $rollo = $asignado->rollo;
                        if (! $rollo) {
                            continue;
                        }
                        // Se libera antes de moverlo: llega a su destino como un rollo más, disponible.
                        $this->rollos->cambiarEstado($rollo, Rollo::DISPONIBLE, RolloMovimiento::CANCELACION, 'transferencia', $t->id);
                        $rollo = $rollo->fresh();

                        $viaja = (float) $asignado->metros + 0.001 >= (float) $rollo->metros_actual
                            ? $this->rollos->trasladar($rollo, ['almacen_id' => $destinoId], auth()->id())
                            : $this->rollos->dividir($rollo, (float) $asignado->metros, $destinoId, auth()->id());

                        // Viaja en tránsito: queda disponible en el destino recién cuando lo reciben.
                        $this->rollos->cambiarEstado($viaja, Rollo::EN_TRANSITO, RolloMovimiento::TRASLADO, 'transferencia', $t->id);
                        $asignado->update(['rollo_viaja_id' => $viaja->id]);
                    }

                    $linea->update(['cantidad_enviada' => $linea->presentacion->desdeMetros($linea->metrosAsignados())]);
                }

                try {
                    $this->stock->salida(
                        $linea->presentacion,
                        $t->almacenOrigen,
                        (float) $linea->cantidad_enviada,
                        0,
                        'transferencia',
                        'transferencia',
                        $t->id,
                        auth()->id(),
                        colorId: $linea->producto_color_id,
                    );

                    // Lo que se manda por cantidad (lo agregado al armar el traslado) también mueve sus rollos.
                    if (! $linea->esTela()) {
                        app(TrasladoRollosService::class)->mover($linea, (int) $t->almacen_origen_id, $destinoId);
                    }
                } catch (\RuntimeException $e) {
                    throw new \DomainException($e->getMessage());
                }
            }

            $t->update($transporte + [
                'serie' => Transferencia::SERIE,
                'numero' => $this->siguienteGuia(),
                'estado' => 'en_transito',
                'fecha_inicio_traslado' => now()->toDateString(),
                'fecha_envio' => now(),
                'usuario_envio_id' => auth()->id(),
            ]);

            return $this->cargar($t->fresh());
        });
    }

    /** El almacén pedido no puede atenderlo (o el que pidió se arrepiente): los rollos apartados quedan libres. */
    public function cerrar(Transferencia $t, string $estadoFinal, ?string $motivo = null): Transferencia
    {
        if (! in_array($t->estado, [self::SOLICITADA, self::PREPARANDO, self::SEPARADA], true)) {
            throw new \DomainException('Este requerimiento ya salió o está cerrado.');
        }

        return DB::transaction(function () use ($t, $estadoFinal, $motivo) {
            $t->load('detalles.rollos.rollo');
            foreach ($t->detalles as $linea) {
                foreach ($linea->rollos as $asignado) {
                    if ($asignado->rollo) {
                        $this->rollos->cambiarEstado($asignado->rollo, Rollo::DISPONIBLE, RolloMovimiento::CANCELACION, 'transferencia', $t->id);
                    }
                    $asignado->delete();
                }
            }
            $t->update(['estado' => $estadoFinal, 'motivo_rechazo' => $motivo]);

            return $this->cargar($t->fresh());
        });
    }

    public function estaCompleto(Transferencia $t): bool
    {
        return $t->detalles->every(fn (TransferenciaDetalle $d) => $d->estaCubierta());
    }

    public function cargar(Transferencia $t): Transferencia
    {
        return $t->load([
            'almacenOrigen:id,nombre,numero_serie',
            'almacenDestino:id,nombre,numero_serie',
            'usuarioSolicita:id,name',
            'usuarioEnvio:id,name',
            'usuarioRecepcion:id,name',
            'detalles.presentacion.producto.marca',
            'detalles.color',
            'detalles.rollos.rollo.color',
        ]);
    }

    /** RQ002-001: correlativo propio de cada almacén pedido, de 3 cifras. */
    private function siguienteNumero(string $serie, int $almacenId): string
    {
        $doc = SerieDocumento::where('tipo_documento', 'requerimiento_traslado')
            ->where('serie', $serie)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'requerimiento_traslado', 'serie' => $serie],
                ['numero_actual' => 0, 'activo' => true, 'almacen_id' => $almacenId],
            );
        $doc->increment('numero_actual');

        return str_pad((string) $doc->numero_actual, 3, '0', STR_PAD_LEFT);
    }

    /** La guía de traslado nace al despachar: T001-00000012. */
    private function siguienteGuia(): string
    {
        $doc = SerieDocumento::where('tipo_documento', 'guia_traslado')
            ->where('serie', Transferencia::SERIE)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'guia_traslado', 'serie' => Transferencia::SERIE],
                ['numero_actual' => 0, 'activo' => true]
            );
        $doc->increment('numero_actual');

        return str_pad((string) $doc->numero_actual, 8, '0', STR_PAD_LEFT);
    }
}
