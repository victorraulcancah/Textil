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
    /**
     * La apertura con la que el usuario puede operar: la de SU caja, y solo si la abrió él. Una caja compartida la
     * puede tener abierta un solo usuario a la vez: el otro no la usa hasta que se cierre.
     */
    public function aperturaPara(?User $usuario = null, ?int $almacenId = null): ?AperturaCaja
    {
        $usuario ??= auth('api')->user() ?? auth()->user();

        if ($caja = $usuario?->cajaActual($almacenId)) {
            $abierta = AperturaCaja::where('estado', 'abierta')
                ->where('caja_id', $caja->id)
                ->latest('fecha_apertura')
                ->first();

            return $abierta && (int) $abierta->usuario_id === (int) $usuario->id ? $abierta : null;
        }

        return null;
    }

    /**
     * La caja abierta del usuario o, si no la tiene, un 422 que dice por qué no puede cobrar ni pagar: no tiene
     * caja asignada o su caja está cerrada.
     */
    public function exigirApertura(?User $usuario = null, ?int $almacenId = null): AperturaCaja
    {
        $usuario ??= auth('api')->user() ?? auth()->user();

        $caja = $usuario?->cajaActual($almacenId);
        if (! $caja) {
            $this->negar('No tienes una caja asignada en este almacén: pide que te asignen una para poder cobrar o pagar.');
        }

        $apertura = $this->aperturaPara($usuario, $almacenId);
        if (! $apertura) {
            // Una caja compartida: si la tiene abierta otro usuario, esa persona la sigue usando.
            $abierta = $caja->aperturaAbierta();
            if ($abierta && (int) $abierta->usuario_id !== (int) $usuario->id) {
                $quien = $abierta->usuario?->name ?? 'otro usuario';
                $this->negar("La caja {$caja->codigo} está en uso: la tiene abierta {$quien}. Espera a que la cierre para usarla.");
            }
            $this->negar("Tu caja ({$caja->nombre}) está cerrada: ábrela en Mi Caja para poder cobrar o pagar.");
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
