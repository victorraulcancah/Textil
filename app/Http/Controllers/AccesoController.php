<?php

namespace App\Http\Controllers;

use App\Models\Auditoria;
use App\Models\PermisoExcepcion;
use App\Models\SolicitudPermiso;
use App\Models\User;
use App\Support\Permisos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Administración de accesos: la bandeja de solicitudes y las excepciones por
 * persona. Lo que una persona pide para sí está en MiAccesoController.
 */
class AccesoController extends Controller
{
    public function solicitudes(Request $request): JsonResponse
    {
        $query = SolicitudPermiso::with('usuario:id,name,email', 'resueltaPor:id,name')->latest('id');

        if ($request->filled('estado')) {
            $query->where('estado', $request->input('estado'));
        }

        return response()->json([
            'pendientes' => SolicitudPermiso::where('estado', 'pendiente')->count(),
            'data' => $query->limit(300)->get()->map(fn ($s) => $s->toArray() + [
                'etiqueta' => Permisos::etiqueta($s->permiso),
            ]),
        ]);
    }

    /** Aprobar = conceder una excepción a quien lo pidió, con el alcance que elija quien aprueba. */
    public function aprobar(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'alcance' => ['required', Rule::in([PermisoExcepcion::UNA_VEZ, PermisoExcepcion::TEMPORAL, PermisoExcepcion::PERMANENTE])],
            'expira_en' => 'nullable|required_if:alcance,temporal|date|after:now',
            'respuesta' => 'nullable|string|max:500',
        ]);

        $admin = auth('api')->user();

        $solicitud = DB::transaction(function () use ($id, $data, $admin) {
            $solicitud = SolicitudPermiso::lockForUpdate()->findOrFail($id);

            if ($solicitud->estado !== 'pendiente') {
                abort(422, 'Esta solicitud ya fue resuelta.');
            }

            $excepcion = PermisoExcepcion::create([
                'user_id' => $solicitud->user_id,
                'permiso' => $solicitud->permiso,
                'alcance' => $data['alcance'],
                'expira_en' => $data['alcance'] === PermisoExcepcion::TEMPORAL ? $data['expira_en'] : null,
                'motivo' => $solicitud->motivo,
                'concedido_por' => $admin->id,
            ]);

            $solicitud->update([
                'estado' => 'aprobada',
                'respuesta' => $data['respuesta'] ?? null,
                'resuelta_por' => $admin->id,
                'resuelta_en' => now(),
                'excepcion_id' => $excepcion->id,
            ]);

            return $solicitud;
        });

        Auditoria::registrar('aprobo_solicitud', [
            'modulo' => 'Accesos',
            'auditable_type' => SolicitudPermiso::class,
            'auditable_id' => $solicitud->id,
            'descripcion' => Permisos::etiqueta($solicitud->permiso).' → '.User::find($solicitud->user_id)?->name." ({$data['alcance']})",
        ]);

        return response()->json($solicitud->fresh()->load('usuario:id,name,email', 'resueltaPor:id,name'));
    }

    public function rechazar(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['respuesta' => 'nullable|string|max:500']);

        $solicitud = SolicitudPermiso::findOrFail($id);

        if ($solicitud->estado !== 'pendiente') {
            return response()->json(['message' => 'Esta solicitud ya fue resuelta.'], 422);
        }

        $solicitud->update([
            'estado' => 'rechazada',
            'respuesta' => $data['respuesta'] ?? null,
            'resuelta_por' => auth('api')->id(),
            'resuelta_en' => now(),
        ]);

        Auditoria::registrar('rechazo_solicitud', [
            'modulo' => 'Accesos',
            'auditable_type' => SolicitudPermiso::class,
            'auditable_id' => $solicitud->id,
            'descripcion' => Permisos::etiqueta($solicitud->permiso).' → '.User::find($solicitud->user_id)?->name,
        ]);

        return response()->json($solicitud->load('usuario:id,name,email', 'resueltaPor:id,name'));
    }

    /** Excepciones de una persona (todas, con su estado: vigente, usada, vencida o revocada). */
    public function excepciones(Request $request): JsonResponse
    {
        $request->validate(['usuario_id' => 'required|exists:users,id']);

        $lista = PermisoExcepcion::with('concedidoPor:id,name')
            ->where('user_id', $request->integer('usuario_id'))
            ->latest('id')
            ->get()
            ->map(fn (PermisoExcepcion $e) => $e->toArray() + [
                'etiqueta' => Permisos::etiqueta($e->permiso),
                'estado' => $e->estado(),
            ]);

        return response()->json($lista);
    }

    /** Concede un permiso a una persona sin que lo haya pedido. */
    public function conceder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'usuario_id' => 'required|exists:users,id',
            'permiso' => ['required', 'string', Rule::in(Permisos::todos())],
            'alcance' => ['required', Rule::in([PermisoExcepcion::UNA_VEZ, PermisoExcepcion::TEMPORAL, PermisoExcepcion::PERMANENTE])],
            'expira_en' => 'nullable|required_if:alcance,temporal|date|after:now',
            'motivo' => 'nullable|string|max:500',
        ]);

        $excepcion = PermisoExcepcion::create([
            'user_id' => $data['usuario_id'],
            'permiso' => $data['permiso'],
            'alcance' => $data['alcance'],
            'expira_en' => $data['alcance'] === PermisoExcepcion::TEMPORAL ? $data['expira_en'] : null,
            'motivo' => $data['motivo'] ?? null,
            'concedido_por' => auth('api')->id(),
        ]);

        // Si la persona tenía pedido este mismo permiso, queda atendido.
        SolicitudPermiso::where('user_id', $data['usuario_id'])
            ->where('permiso', $data['permiso'])
            ->where('estado', 'pendiente')
            ->update([
                'estado' => 'aprobada',
                'resuelta_por' => auth('api')->id(),
                'resuelta_en' => now(),
                'excepcion_id' => $excepcion->id,
            ]);

        Auditoria::registrar('concedio_acceso', [
            'modulo' => 'Accesos',
            'auditable_type' => PermisoExcepcion::class,
            'auditable_id' => $excepcion->id,
            'descripcion' => Permisos::etiqueta($excepcion->permiso).' → '.User::find($data['usuario_id'])?->name." ({$data['alcance']})",
        ]);

        return response()->json($excepcion->toArray() + [
            'etiqueta' => Permisos::etiqueta($excepcion->permiso),
            'estado' => $excepcion->estado(),
        ], 201);
    }

    /** Quita la excepción: deja de valer desde ya. Queda en el historial. */
    public function revocar(int $id): JsonResponse
    {
        $excepcion = PermisoExcepcion::findOrFail($id);

        if (! $excepcion->revocada_en) {
            $excepcion->update(['revocada_en' => now(), 'revocada_por' => auth('api')->id()]);

            Auditoria::registrar('revoco_acceso', [
                'modulo' => 'Accesos',
                'auditable_type' => PermisoExcepcion::class,
                'auditable_id' => $excepcion->id,
                'descripcion' => Permisos::etiqueta($excepcion->permiso).' → '.User::find($excepcion->user_id)?->name,
            ]);
        }

        return response()->json($excepcion->toArray() + [
            'etiqueta' => Permisos::etiqueta($excepcion->permiso),
            'estado' => $excepcion->estado(),
        ]);
    }
}
