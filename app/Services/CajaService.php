<?php

namespace App\Services;

use App\Models\AperturaCaja;
use App\Models\MotivoMovimiento;
use App\Models\User;

/**
 * La caja donde se anota lo que entra y sale por un cobro o un pago.
 *
 * Se anota en la caja abierta de quien opera (la que ve en Mi Caja). Si esa
 * persona no tiene caja abierta, en la última que esté abierta, para que el
 * movimiento no se pierda; y si no hay ninguna, no se anota nada.
 */
class CajaService
{
    public function aperturaPara(?User $usuario = null): ?AperturaCaja
    {
        $usuario ??= auth('api')->user() ?? auth()->user();

        if ($usuario?->caja_id) {
            $propia = AperturaCaja::where('estado', 'abierta')
                ->where('caja_id', $usuario->caja_id)
                ->latest('fecha_apertura')
                ->first();

            if ($propia) {
                return $propia;
            }
        }

        return AperturaCaja::where('estado', 'abierta')->latest('fecha_apertura')->first();
    }

    /** El id de un motivo de caja del sistema (por su nombre), o null si no existe. */
    public function motivo(string $nombre): ?int
    {
        return MotivoMovimiento::where('ambito', 'caja')->where('nombre', $nombre)->value('id');
    }
}
