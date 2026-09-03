<?php

namespace App\Http\Controllers;

use App\Models\MotivoTraslado;
use App\Models\Transferencia;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MotivoTrasladoController extends Controller
{
    public function index()
    {
        return response()->json(MotivoTraslado::orderBy('nombre')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'activo' => 'boolean',
        ]);

        // El código se deriva del nombre y debe ser único: si ya existe se
        // le agrega un sufijo numérico.
        $base = MotivoTraslado::codigoDesde($data['nombre']) ?: 'motivo';
        $codigo = $base;
        for ($i = 2; MotivoTraslado::where('codigo', $codigo)->exists(); $i++) {
            $codigo = "{$base}_{$i}";
        }

        $motivo = MotivoTraslado::create([
            'codigo' => $codigo,
            'nombre' => $data['nombre'],
            'es_sistema' => false,
            'activo' => $data['activo'] ?? true,
        ]);

        return response()->json($motivo, 201);
    }

    public function update(Request $request, MotivoTraslado $motivosTraslado)
    {
        $data = $request->validate([
            'nombre' => ['sometimes', 'required', 'string', 'max:255'],
            'activo' => 'boolean',
        ]);

        // El nombre del sistema es fijo; solo se puede activar/desactivar.
        if ($motivosTraslado->es_sistema) {
            unset($data['nombre']);
        }

        $motivosTraslado->update($data);

        return response()->json($motivosTraslado->fresh());
    }

    public function destroy(MotivoTraslado $motivosTraslado)
    {
        if ($motivosTraslado->es_sistema) {
            return response()->json(['message' => 'Los motivos del sistema no se pueden eliminar.'], 422);
        }

        // Si alguna guía lo usa, se desactiva en vez de borrarlo: borrar
        // dejaría guías con un motivo que ya no existe.
        if (Transferencia::where('motivo_traslado', $motivosTraslado->codigo)->exists()) {
            $motivosTraslado->update(['activo' => false]);

            return response()->json([
                'message' => 'El motivo está en uso por guías existentes: se desactivó en lugar de eliminarse.',
                'desactivado' => true,
            ]);
        }

        $motivosTraslado->delete();

        return response()->json(['message' => 'Eliminado']);
    }
}
