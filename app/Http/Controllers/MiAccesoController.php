<?php

namespace App\Http\Controllers;

use App\Models\Auditoria;
use App\Models\PermisoExcepcion;
use App\Models\SolicitudPermiso;
use App\Support\Permisos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Lo que cada persona puede ver y pedir sobre sus propios accesos. Va fuera
 * del árbol de permisos (prefijo "mi-acceso/"): si hiciera falta un permiso
 * para pedir permisos, nadie podría pedirlos.
 */
class MiAccesoController extends Controller
{
    /** Mis roles, mis permisos, mis excepciones vigentes y el catálogo para pedir. */
    public function resumen(): JsonResponse
    {
        $user = auth('api')->user();

        $excepciones = PermisoExcepcion::vigentes()
            ->where('user_id', $user->id)
            ->orderBy('id')
            ->get()
            ->map(fn (PermisoExcepcion $e) => $this->comoArreglo($e));

        return response()->json([
            'roles' => $user->getRoleNames()->values(),
            'permisos' => Permisos::efectivos($user),
            'excepciones' => $excepciones,
            'arbol' => Permisos::arbol(),
        ]);
    }

    public function solicitudes(): JsonResponse
    {
        $lista = SolicitudPermiso::with('resueltaPor:id,name')
            ->where('user_id', auth('api')->id())
            ->latest('id')
            ->limit(100)
            ->get()
            ->map(fn (SolicitudPermiso $s) => $this->comoArreglo($s));

        return response()->json($lista);
    }

    /**
     * Pide un permiso. Es idempotente: si ya hay una solicitud pendiente de
     * ese mismo permiso, devuelve esa en vez de crear otra.
     */
    public function solicitar(Request $request): JsonResponse
    {
        $user = auth('api')->user();

        $data = $request->validate([
            'permiso' => ['required', 'string', Rule::in(Permisos::todos())],
            'motivo' => 'nullable|string|max:500',
        ]);

        if (Permisos::puede($user, $data['permiso'])) {
            return response()->json(['message' => 'Ya tienes este permiso.'], 422);
        }

        $existente = SolicitudPermiso::where('user_id', $user->id)
            ->where('permiso', $data['permiso'])
            ->where('estado', 'pendiente')
            ->first();

        if ($existente) {
            return response()->json($this->comoArreglo($existente), 200);
        }

        $solicitud = SolicitudPermiso::create([
            'user_id' => $user->id,
            'permiso' => $data['permiso'],
            'motivo' => $data['motivo'] ?? null,
            'estado' => 'pendiente',
        ]);

        Auditoria::registrar('solicito_acceso', [
            'modulo' => 'Accesos',
            'auditable_type' => SolicitudPermiso::class,
            'auditable_id' => $solicitud->id,
            'descripcion' => Permisos::etiqueta($solicitud->permiso),
        ]);

        return response()->json($this->comoArreglo($solicitud), 201);
    }

    private function comoArreglo(SolicitudPermiso|PermisoExcepcion $modelo): array
    {
        $datos = $modelo->toArray() + ['etiqueta' => Permisos::etiqueta($modelo->permiso)];

        if ($modelo instanceof PermisoExcepcion) {
            $datos['estado'] = $modelo->estado();
        }

        return $datos;
    }
}
