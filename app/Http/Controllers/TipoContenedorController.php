<?php

namespace App\Http\Controllers;

use App\Models\OrdenCompra;
use App\Models\TipoContenedor;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Los tipos de contenedor (TIPO / TAMAÑO) de la orden de compra al exterior.
 * La orden guarda el texto ("2X40 HC"), no el id: borrar un tipo no rompe órdenes.
 */
class TipoContenedorController extends Controller
{
    public function index()
    {
        return response()->json(TipoContenedor::orderBy('nombre')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => ['required', 'string', 'max:50', Rule::unique('tipos_contenedor', 'nombre')],
            'activo' => 'boolean',
        ]);
        $data['nombre'] = mb_strtoupper(trim(preg_replace('/\s+/', ' ', $data['nombre'])));

        return response()->json(TipoContenedor::create($data), 201);
    }

    public function update(Request $request, TipoContenedor $tiposContenedor)
    {
        $data = $request->validate([
            'nombre' => ['sometimes', 'required', 'string', 'max:50', Rule::unique('tipos_contenedor', 'nombre')->ignore($tiposContenedor->id)],
            'activo' => 'boolean',
        ]);
        if (isset($data['nombre'])) {
            $data['nombre'] = mb_strtoupper(trim(preg_replace('/\s+/', ' ', $data['nombre'])));
        }

        $tiposContenedor->update($data);

        return response()->json($tiposContenedor->fresh());
    }

    public function destroy(TipoContenedor $tiposContenedor)
    {
        // Una orden que lo usa guarda el texto: se desactiva en vez de borrarlo,
        // para que siga apareciendo al abrir esa orden.
        $enUso = OrdenCompra::where('numero_contenedor', 'like', '%'.str_replace(' ', '%', $tiposContenedor->nombre))->exists();
        if ($enUso) {
            $tiposContenedor->update(['activo' => false]);

            return response()->json([
                'message' => 'El tipo está en uso por órdenes existentes: se desactivó en lugar de eliminarse.',
                'desactivado' => true,
            ]);
        }

        $tiposContenedor->delete();

        return response()->json(['message' => 'Eliminado']);
    }
}
