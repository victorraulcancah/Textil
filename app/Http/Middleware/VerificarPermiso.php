<?php

namespace App\Http\Middleware;

use App\Support\Permisos;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bloquea la petición si el usuario no tiene el permiso que le corresponde
 * según la ruta y el método (config/permisos.php).
 *
 * Las rutas que no están en el árbol pasan sin comprobación: son de apoyo
 * (login, consulta de RUC, generación de PDF) y ya están detrás de auth.
 */
class VerificarPermiso
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = auth('api')->user();

        // Sin sesión no decide este middleware: responde el de autenticación.
        if (! $user) {
            return $next($request);
        }

        // El rol de administración siempre puede: así un permiso mal quitado
        // no deja a nadie fuera del sistema.
        if ($user->hasRole(config('permisos.super_admin'))) {
            return $next($request);
        }

        $permiso = Permisos::paraPeticion($request->path(), $request->method());

        if ($permiso && ! $user->can($permiso)) {
            return response()->json([
                'message' => 'No tienes permiso para realizar esta acción.',
                'permiso' => $permiso,
            ], 403);
        }

        return $next($request);
    }
}
