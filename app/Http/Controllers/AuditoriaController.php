<?php

namespace App\Http\Controllers;

use App\Models\Auditoria;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Consulta de la bitácora. Solo lectura: la auditoría no se edita ni se borra
 * desde la aplicación, por eso este controlador no tiene store/update/destroy.
 */
class AuditoriaController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->input('per_page', 50), 1), 500);

        $registros = Auditoria::with('usuario:id,name,email')
            ->when($request->filled('accion'), fn ($q) => $q->where('accion', $request->input('accion')))
            ->when($request->filled('modulo'), fn ($q) => $q->where('modulo', $request->input('modulo')))
            ->when($request->filled('user_id'), fn ($q) => $q->where('user_id', $request->input('user_id')))
            ->when($request->filled('desde'), fn ($q) => $q->whereDate('created_at', '>=', $request->input('desde')))
            ->when($request->filled('hasta'), fn ($q) => $q->whereDate('created_at', '<=', $request->input('hasta')))
            ->when($request->filled('buscar'), function ($q) use ($request) {
                $t = '%'.$request->input('buscar').'%';
                $q->where(fn ($s) => $s->where('descripcion', 'like', $t)
                    ->orWhere('usuario_nombre', 'like', $t)
                    ->orWhere('modulo', 'like', $t));
            })
            ->latest('id')
            ->paginate($perPage);

        return response()->json($registros);
    }

    /** Valores disponibles para armar los filtros de la pantalla. */
    public function filtros(): JsonResponse
    {
        return response()->json([
            'acciones' => collect(Auditoria::ACCIONES)
                ->map(fn ($label, $value) => ['value' => $value, 'label' => $label])
                ->values(),
            'modulos' => Auditoria::query()
                ->whereNotNull('modulo')
                ->distinct()
                ->orderBy('modulo')
                ->pluck('modulo'),
            'usuarios' => Auditoria::query()
                ->whereNotNull('user_id')
                ->with('usuario:id,name')
                ->get()
                ->pluck('usuario')
                ->filter()
                ->unique('id')
                ->sortBy('name')
                ->map(fn ($u) => ['value' => (string) $u->id, 'label' => $u->name])
                ->values(),
        ]);
    }
}
