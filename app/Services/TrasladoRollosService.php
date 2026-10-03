<?php

namespace App\Services;

use App\Models\ProductoPresentacion;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Models\TransferenciaDetalle;

/**
 * Mueve al almacén destino los rollos que cubren una cantidad enviada por stock (un traslado directo, o lo que se
 * agrega a un requerimiento antes de despacharlo). Los rollos viajan "en tránsito" y quedan registrados para poder
 * recepcionarlos escaneando su QR en el destino.
 */
class TrasladoRollosService
{
    public function __construct(private readonly RolloService $rollos)
    {
    }

    /**
     * Lo que pesan N rollos enteros de una tela y color en el origen, en la unidad de la presentación: se toman los más
     * antiguos disponibles. Así una línea "3 rollos" se convierte en la cantidad que el traslado descuenta.
     */
    public function cantidadDeRollos(ProductoPresentacion $presentacion, ?int $colorId, int $almacenId, int $rollos, array $excluir = []): float
    {
        $candidatos = Rollo::disponibles()
            ->where('producto_id', $presentacion->producto_id)
            ->where('almacen_id', $almacenId)
            // Igual que al mover: el color exacto (o los rollos sin color).
            ->where('producto_color_id', $colorId)
            // Los que ya se escogieron escaneando no se cuentan dos veces.
            ->whereNotIn('id', $excluir)
            ->orderBy('numero')
            ->limit($rollos)
            ->get();

        if ($candidatos->count() < $rollos) {
            $nombre = $presentacion->producto?->nombre ?? 'la tela';
            throw new \DomainException("No hay {$rollos} rollo(s) disponibles de \"{$nombre}\" en el almacén de origen: hay {$candidatos->count()}.");
        }

        return round($presentacion->desdeMetros((float) $candidatos->sum('metros_actual')), 2);
    }

    /**
     * Valida un rollo escaneado para mandarlo en un traslado y devuelve lo que la pantalla necesita para agregarlo.
     * Tiene que existir, estar disponible, ser de una tela y estar en el almacén de origen.
     */
    public function rolloParaTraslado(string $codigo, int $almacenOrigenId): array
    {
        $codigo = trim($codigo);
        $rollo = Rollo::with('producto.presentaciones.unidadBase', 'color')->where('codigo', $codigo)->first();

        if (! $rollo) {
            throw new \DomainException("No existe ningún rollo con el código {$codigo}.");
        }
        if (! $rollo->estaDisponible()) {
            $estado = strtolower(Rollo::ESTADOS[$rollo->estado] ?? $rollo->estado);
            throw new \DomainException("El rollo {$codigo} está {$estado}: no se puede mandar.");
        }
        if ((int) $rollo->almacen_id !== $almacenOrigenId) {
            throw new \DomainException("El rollo {$codigo} no está en el almacén de origen.");
        }

        $metro = $rollo->producto?->presentacionMetro();
        if (! $metro) {
            throw new \DomainException("El rollo {$codigo} no es de una tela que se maneje por metros.");
        }

        return [
            'rollo_id' => $rollo->id,
            'codigo' => $rollo->codigo,
            'metros' => (float) $rollo->metros_actual,
            'metros_rollo' => (float) $rollo->metros_actual,
            'producto_id' => $rollo->producto_id,
            'producto' => $rollo->producto?->nombre,
            'producto_presentacion_id' => $metro->id,
            'producto_color_id' => $rollo->producto_color_id,
            'color' => $rollo->color?->nombre,
            'color_hex' => $rollo->color?->hex,
        ];
    }

    /**
     * Revisa los rollos que se escogieron escaneando (siguen disponibles, son de esa tela y color, y los metros caben) y
     * devuelve la cantidad en la unidad de la presentación y las filas a guardar en la línea.
     *
     * @param  list<array{rollo_id: int, metros: float}>  $escogidos
     * @return array{0: float, 1: list<array<string, mixed>>}
     */
    public function prepararEscaneados(ProductoPresentacion $presentacion, ?int $colorId, int $almacenOrigenId, array $escogidos): array
    {
        $filas = [];
        $total = 0.0;
        $vistos = [];

        foreach ($escogidos as $e) {
            $rollo = Rollo::find($e['rollo_id']);
            if (! $rollo || in_array($rollo->id, $vistos, true)) {
                throw new \DomainException('Hay un rollo repetido o que ya no existe en la lista.');
            }
            $vistos[] = $rollo->id;

            if (! $rollo->estaDisponible() || (int) $rollo->almacen_id !== $almacenOrigenId) {
                throw new \DomainException("El rollo {$rollo->codigo} ya no está disponible en el almacén de origen.");
            }
            if ((int) $rollo->producto_id !== (int) $presentacion->producto_id || (int) ($rollo->producto_color_id ?? 0) !== (int) ($colorId ?? 0)) {
                throw new \DomainException("El rollo {$rollo->codigo} no es de esa tela y color.");
            }

            $actual = (float) $rollo->metros_actual;
            $metros = round(min((float) $e['metros'], $actual), 2);
            if ($metros <= 0) {
                throw new \DomainException("Los metros del rollo {$rollo->codigo} deben ser mayores a cero.");
            }

            $total += $metros;
            $filas[] = [
                'rollo_id' => $rollo->id,
                'metros' => $metros,
                'metros_rollo' => $actual,
                'entero' => $metros + 0.001 >= $actual,
                'escaneado_at' => now(),
                'usuario_escanea_id' => auth()->id(),
            ];
        }

        return [round($presentacion->desdeMetros($total), 2), $filas];
    }

    /** Mueve exactamente los rollos que se escogieron escaneando (enteros, o con corte si se pidieron menos metros). */
    private function moverEscogidos(TransferenciaDetalle $detalle, $filas, int $almacenOrigenId, int $almacenDestinoId): void
    {
        foreach ($filas as $fila) {
            $rollo = Rollo::lockForUpdate()->find($fila->rollo_id);

            if (! $rollo || ! $rollo->estaDisponible() || (int) $rollo->almacen_id !== $almacenOrigenId) {
                throw new \RuntimeException('El rollo '.($rollo?->codigo ?? $fila->rollo_id).' ya no está disponible en el almacén de origen.');
            }

            $metros = min((float) $fila->metros, (float) $rollo->metros_actual);
            $viaja = $metros + 0.001 >= (float) $rollo->metros_actual
                ? $this->rollos->trasladar($rollo, ['almacen_id' => $almacenDestinoId], auth()->id())
                : $this->rollos->dividir($rollo, $metros, $almacenDestinoId, auth()->id());

            $this->rollos->cambiarEstado($viaja, Rollo::EN_TRANSITO, RolloMovimiento::TRASLADO, 'transferencia', $detalle->transferencia_id);
            $fila->update([
                'rollo_viaja_id' => $viaja->id,
                'metros' => $metros,
                'metros_rollo' => (float) $rollo->metros_actual,
                'entero' => $viaja->id === $rollo->id,
            ]);
        }
    }

    /**
     * Toma los rollos del más antiguo al más nuevo. Si sobran metros del último, se parte: el trozo enviado viaja y el
     * resto se queda donde estaba. Un producto que no se maneja por rollos no tiene nada que mover aquí: ya lo cubrió
     * el stock.
     */
    public function mover(TransferenciaDetalle $detalle, int $almacenOrigenId, int $almacenDestinoId): void
    {
        $detalle->loadMissing('presentacion.producto');

        // Los rollos que se escogieron escaneando salen exactamente esos.
        $escogidos = $detalle->rollos()->whereNull('rollo_viaja_id')->get();
        if ($escogidos->isNotEmpty()) {
            $this->moverEscogidos($detalle, $escogidos, $almacenOrigenId, $almacenDestinoId);

            return;
        }

        $factor = (float) ($detalle->presentacion->factor_conversion ?: 1);
        $basePorMetro = max((float) ($detalle->presentacion->producto?->factorBasePorMetro() ?? 1), 0.0001);
        $metrosPorMover = round((float) $detalle->cantidad_enviada * $factor / $basePorMetro, 2);

        $usaRollos = Rollo::where('producto_id', $detalle->presentacion->producto_id)->exists();
        if (! $usaRollos) {
            return;
        }

        // Los rollos escogidos escaneando en otra línea de este mismo traslado no se toman aquí.
        $reservados = \App\Models\TransferenciaRollo::whereIn(
            'transferencia_detalle_id',
            TransferenciaDetalle::where('transferencia_id', $detalle->transferencia_id)->pluck('id'),
        )->whereNull('rollo_viaja_id')->pluck('rollo_id');

        $candidatos = Rollo::disponibles()
            ->where('producto_id', $detalle->presentacion->producto_id)
            ->where('almacen_id', $almacenOrigenId)
            ->where('producto_color_id', $detalle->producto_color_id)
            ->whereNotIn('id', $reservados)
            ->orderBy('numero')
            ->get();

        foreach ($candidatos as $rollo) {
            if ($metrosPorMover <= 0.001) {
                break;
            }

            $metrosRollo = (float) $rollo->metros_actual;

            if ($metrosRollo <= $metrosPorMover + 0.001) {
                $viaja = $this->rollos->trasladar($rollo, ['almacen_id' => $almacenDestinoId], auth()->id());
                $enviado = $metrosRollo;
                $metrosPorMover = round($metrosPorMover - $metrosRollo, 2);
            } else {
                $viaja = $this->rollos->dividir($rollo, $metrosPorMover, $almacenDestinoId, auth()->id());
                $enviado = $metrosPorMover;
                $metrosPorMover = 0;
            }

            // Viaja en tránsito y queda registrado para recepcionarlo escaneando su QR en el destino.
            $this->rollos->cambiarEstado($viaja, Rollo::EN_TRANSITO, RolloMovimiento::TRASLADO, 'transferencia', $detalle->transferencia_id);
            $detalle->rollos()->create([
                'rollo_id' => $rollo->id,
                'rollo_viaja_id' => $viaja->id,
                'metros' => $enviado,
                'metros_rollo' => $metrosRollo,
                'entero' => $viaja->id === $rollo->id,
                'escaneado_at' => now(),
                'usuario_escanea_id' => auth()->id(),
            ]);
        }

        if ($metrosPorMover > 0.001) {
            $color = $detalle->producto_color_id ? ' de ese color' : '';
            throw new \RuntimeException(
                "No hay rollos{$color} suficientes de \"{$detalle->presentacion->producto?->nombre}\" en el almacén de origen "
                ."para cubrir {$detalle->cantidad_enviada} {$detalle->presentacion->nombre}."
            );
        }
    }
}
