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
    public function cantidadDeRollos(ProductoPresentacion $presentacion, ?int $colorId, int $almacenId, int $rollos): float
    {
        $candidatos = Rollo::disponibles()
            ->where('producto_id', $presentacion->producto_id)
            ->where('almacen_id', $almacenId)
            // Igual que al mover: el color exacto (o los rollos sin color).
            ->where('producto_color_id', $colorId)
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
     * Toma los rollos del más antiguo al más nuevo. Si sobran metros del último, se parte: el trozo enviado viaja y el
     * resto se queda donde estaba. Un producto que no se maneja por rollos no tiene nada que mover aquí: ya lo cubrió
     * el stock.
     */
    public function mover(TransferenciaDetalle $detalle, int $almacenOrigenId, int $almacenDestinoId): void
    {
        $detalle->loadMissing('presentacion.producto');

        $factor = (float) ($detalle->presentacion->factor_conversion ?: 1);
        $basePorMetro = max((float) ($detalle->presentacion->producto?->factorBasePorMetro() ?? 1), 0.0001);
        $metrosPorMover = round((float) $detalle->cantidad_enviada * $factor / $basePorMetro, 2);

        $usaRollos = Rollo::where('producto_id', $detalle->presentacion->producto_id)->exists();
        if (! $usaRollos) {
            return;
        }

        $candidatos = Rollo::disponibles()
            ->where('producto_id', $detalle->presentacion->producto_id)
            ->where('almacen_id', $almacenOrigenId)
            ->where('producto_color_id', $detalle->producto_color_id)
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
