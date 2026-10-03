<?php

namespace App\Services;

use App\Models\AperturaCaja;
use App\Models\MotivoMovimiento;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * La caja donde se anota lo que entra y sale por un cobro o un pago.
 *
 * Cada usuario tiene UNA caja (la que ve en Mi Caja) y solo opera con dinero si esa caja está abierta. Sin caja
 * asignada, o con la caja cerrada, no se puede cobrar ni pagar: nunca se anota en la caja de otro.
 */
class CajaService
{
    public function aperturaPara(?User $usuario = null): ?AperturaCaja
    {
        $usuario ??= auth('api')->user() ?? auth()->user();

        if ($caja = $usuario?->cajaActual()) {
            $propia = AperturaCaja::where('estado', 'abierta')
                ->where('caja_id', $caja->id)
                ->latest('fecha_apertura')
                ->first();

            return $propia;
        }

        return null;
    }

    /**
     * La caja abierta del usuario o, si no la tiene, un 422 que dice por qué no puede cobrar ni pagar: no tiene
     * caja asignada o su caja está cerrada.
     */
    public function exigirApertura(?User $usuario = null): AperturaCaja
    {
        $usuario ??= auth('api')->user() ?? auth()->user();

        if (! $usuario?->cajaActual()) {
            $this->negar('No tienes una caja asignada en este almacén: pide que te asignen una para poder cobrar o pagar.');
        }

        $apertura = $this->aperturaPara($usuario);
        if (! $apertura) {
            $nombre = $usuario->cajaActual()?->nombre;
            $this->negar('Tu caja'.($nombre ? " ({$nombre})" : '').' está cerrada: ábrela en Mi Caja para poder cobrar o pagar.');
        }

        return $apertura;
    }

    private function negar(string $mensaje): never
    {
        throw ValidationException::withMessages(['caja' => [$mensaje]]);
    }

    /** El id de un motivo de caja del sistema (por su nombre), o null si no existe. */
    public function motivo(string $nombre): ?int
    {
        return MotivoMovimiento::where('ambito', 'caja')->where('nombre', $nombre)->value('id');
    }
}
