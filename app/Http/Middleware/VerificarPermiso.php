<?php

namespace App\Http\Middleware;

use App\Models\OrdenCompra;
use App\Models\PermisoExcepcion;
use App\Support\Permisos;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bloquea la petición si el usuario no tiene el permiso que le corresponde
 * según la ruta y el método (config/permisos.php).
 *
 * El permiso puede venir de cualquiera de sus roles o de una excepción
 * vigente. Una excepción "una vez" se gasta solo si la petición sale bien.
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

        // La persona elegida como aprobador de una orden de compra puede aprobarla
        // sea cual sea su rol: es justamente la única que puede.
        if ($request->isMethod('POST') && preg_match('#(?:^|/)ordenes-compra/(\d+)/aprobar$#', $request->path(), $m)
            && (int) OrdenCompra::where('id', $m[1])->value('aprobador_id') === (int) $user->id) {
            return $next($request);
        }

        $permiso = Permisos::paraPeticion($request->path(), $request->method());

        if (! $permiso || $user->can($permiso)) {
            return $next($request);
        }

        // Sus roles no alcanzan: ¿tiene una excepción que sirva?
        $excepcion = Permisos::excepcionVigente($user, $permiso);

        if (! $excepcion) {
            [$submodulo, $accion] = Permisos::partes($permiso);

            return response()->json([
                'message' => 'No tienes permiso para realizar esta acción.',
                'permiso' => $permiso,
                'submodulo' => $submodulo,
                'accion' => $accion,
                'etiqueta' => Permisos::etiqueta($permiso),
            ], 403);
        }

        $respuesta = $next($request);

        // Una vez: se gasta solo si la acción salió bien; si falló por otra
        // causa (validación, error), la persona conserva su único intento.
        if ($excepcion->alcance === PermisoExcepcion::UNA_VEZ && $respuesta->getStatusCode() < 400) {
            PermisoExcepcion::whereKey($excepcion->id)->whereNull('usada_en')->update(['usada_en' => now()]);
        }

        return $respuesta;
    }
}
