<?php

namespace App\Http\Controllers;

use App\Models\ActividadComercial;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ActividadComercialController extends Controller
{
    public function index()
    {
        return response()->json(ActividadComercial::withCount('clientes')->orderBy('nombre')->get());
    }

    /** Las activas, para elegir en el cliente: va con el permiso de Clientes. */
    public function opciones()
    {
        return response()->json(ActividadComercial::where('activo', true)->orderBy('nombre')->get(['id', 'nombre']));
    }

    public function store(Request $request)
    {
        return response()->json(ActividadComercial::create($this->validar($request)), 201);
    }

    public function update(Request $request, ActividadComercial $actividadComercial)
    {
        $actividadComercial->update($this->validar($request, $actividadComercial));

        return response()->json($actividadComercial);
    }

    public function destroy(ActividadComercial $actividadComercial)
    {
        // Si algún cliente la tiene, se desactiva: borrarla lo dejaría sin actividad.
        if ($actividadComercial->clientes()->exists()) {
            $actividadComercial->update(['activo' => false]);

            return response()->json([
                'message' => 'La usan clientes: se desactivó en lugar de eliminarse.',
                'desactivado' => true,
            ]);
        }

        $actividadComercial->delete();

        return response()->json(['message' => 'Eliminada']);
    }

    private function validar(Request $request, ?ActividadComercial $actividad = null): array
    {
        return $request->validate([
            'nombre' => ['required', 'string', 'max:150', Rule::unique('actividades_comerciales', 'nombre')->ignore($actividad?->id)],
            'activo' => 'boolean',
        ], [
            'nombre.unique' => 'Ya existe esa actividad.',
        ]);
    }
}
