<?php

namespace App\Support;

use App\Models\Almacen;
use App\Models\User;
use Illuminate\Contracts\Database\Eloquent\Builder as BuilderContract;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Cada almacén es una sucursal: un usuario vende y opera solo en el suyo, aunque puede ver los demás. El Super Admin
 * (y lo que corre sin usuario, como los seeders) opera en todos.
 */
class AlmacenAcceso
{
    private static function usuario(): ?User
    {
        return auth('api')->user() ?? auth()->user();
    }

    /** ¿Sin restricción de almacén? */
    public static function irrestricto(?User $usuario = null): bool
    {
        $usuario ??= self::usuario();

        return $usuario === null || $usuario->esSuperAdmin();
    }

    /** El almacén en el que trabaja el usuario (null si es irrestricto o no tiene). */
    public static function propio(): ?int
    {
        $usuario = self::usuario();

        return self::irrestricto($usuario) ? null : ($usuario->almacen_id ? (int) $usuario->almacen_id : null);
    }

    /**
     * Corta con 403 si el usuario no puede operar en ese almacén. Un documento sin almacén todavía (null)
     * pasa: aún no es de ninguna sucursal.
     */
    public static function exigir(?int $almacenId): void
    {
        $usuario = self::usuario();
        if (self::irrestricto($usuario) || $almacenId === null) {
            return;
        }

        if (! $usuario->almacen_id) {
            self::negar('No tienes un almacén asignado: pídele a un administrador que te asigne uno para poder operar.');
        }

        if ((int) $usuario->almacen_id !== (int) $almacenId) {
            $propio = Almacen::whereKey($usuario->almacen_id)->value('nombre');
            $otro = Almacen::whereKey($almacenId)->value('nombre');
            self::negar("Solo puedes operar en tu almacén ({$propio}). Esto es del almacén {$otro}: puedes verlo, no modificarlo.");
        }
    }

    /**
     * El almacén con el que se crea un documento: el que se pidió o, si no se pidió, el del usuario. Un usuario
     * normal siempre queda en el suyo; el Super Admin elige.
     */
    public static function resolver(?int $pedido): ?int
    {
        if (self::irrestricto()) {
            return $pedido;
        }

        $propio = self::propio();
        if ($propio === null) {
            self::exigir($pedido ?? 0);
        }

        self::exigir($pedido ?? $propio);

        return $pedido ?? $propio;
    }

    /**
     * El almacén al que se limita un reporte o el dashboard. Un usuario de sucursal ve siempre el suyo (lo que pida
     * en la URL no cuenta); el Super Admin ve el consolidado o, si lo pide, un almacén. 0 = nada (sin almacén asignado).
     */
    public static function paraReporte(?int $pedido): ?int
    {
        if (self::irrestricto()) {
            return $pedido ?: null;
        }

        return self::propio() ?? 0;
    }

    /** Deja en la consulta solo lo del almacén del usuario (el Super Admin ve todo). */
    public static function limitar(BuilderContract $consulta, string $columna = 'almacen_id'): BuilderContract
    {
        if (self::irrestricto()) {
            return $consulta;
        }

        $propio = self::propio();

        return $propio ? $consulta->where($columna, $propio) : $consulta->whereRaw('1 = 0');
    }

    private static function negar(string $mensaje): never
    {
        throw new HttpResponseException(response()->json(['message' => $mensaje], 403));
    }
}
