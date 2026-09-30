<?php

namespace App\Http\Controllers;

use App\Models\CompraGasto;
use App\Models\ConceptoGasto;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Los conceptos de los gastos adicionales de la compra. El gasto guarda el
 * nombre (no el id): borrar un concepto no rompe compras ya registradas.
 */
class ConceptoGastoController extends Controller
{
    public function index()
    {
        return response()->json(ConceptoGasto::orderBy('nombre')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => ['required', 'string', 'max:100', Rule::unique('conceptos_gasto', 'nombre')],
            'activo' => 'boolean',
        ]);
        $data['nombre'] = mb_strtoupper(trim(preg_replace('/\s+/', ' ', $data['nombre'])));

        return response()->json(ConceptoGasto::create($data), 201);
    }

    public function update(Request $request, ConceptoGasto $conceptosGasto)
    {
        $data = $request->validate([
            'nombre' => ['sometimes', 'required', 'string', 'max:100', Rule::unique('conceptos_gasto', 'nombre')->ignore($conceptosGasto->id)],
            'activo' => 'boolean',
        ]);
        if (isset($data['nombre'])) {
            $data['nombre'] = mb_strtoupper(trim(preg_replace('/\s+/', ' ', $data['nombre'])));
        }

        $conceptosGasto->update($data);

        return response()->json($conceptosGasto->fresh());
    }

    public function destroy(ConceptoGasto $conceptosGasto)
    {
        // Si una compra lo usa, se desactiva en vez de borrarlo.
        if (CompraGasto::where('concepto', $conceptosGasto->nombre)->exists()) {
            $conceptosGasto->update(['activo' => false]);

            return response()->json([
                'message' => 'El concepto está en uso por compras existentes: se desactivó en lugar de eliminarse.',
                'desactivado' => true,
            ]);
        }

        $conceptosGasto->delete();

        return response()->json(['message' => 'Eliminado']);
    }
}
