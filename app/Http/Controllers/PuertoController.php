<?php

namespace App\Http\Controllers;

use App\Models\Compra;
use App\Models\OrdenCompra;
use App\Models\Puerto;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Los puertos de la compra al exterior. La orden guarda el nombre (no el id):
 * borrar un puerto no rompe documentos ya emitidos.
 */
class PuertoController extends Controller
{
    public function index()
    {
        return response()->json(Puerto::orderBy('nombre')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => ['required', 'string', 'max:100', Rule::unique('puertos', 'nombre')],
            'activo' => 'boolean',
        ]);
        $data['nombre'] = mb_strtoupper(trim(preg_replace('/\s+/', ' ', $data['nombre'])));

        return response()->json(Puerto::create($data), 201);
    }

    public function update(Request $request, Puerto $puerto)
    {
        $data = $request->validate([
            'nombre' => ['sometimes', 'required', 'string', 'max:100', Rule::unique('puertos', 'nombre')->ignore($puerto->id)],
            'activo' => 'boolean',
        ]);
        if (isset($data['nombre'])) {
            $data['nombre'] = mb_strtoupper(trim(preg_replace('/\s+/', ' ', $data['nombre'])));
        }

        $puerto->update($data);

        return response()->json($puerto->fresh());
    }

    public function destroy(Puerto $puerto)
    {
        // Si una orden o una compra lo usa, se desactiva en vez de borrarlo.
        $enUso = OrdenCompra::where('puerto_embarque', $puerto->nombre)->orWhere('puerto_destino', $puerto->nombre)->exists()
            || Compra::where('puerto_embarque', $puerto->nombre)->orWhere('puerto_destino', $puerto->nombre)->exists();

        if ($enUso) {
            $puerto->update(['activo' => false]);

            return response()->json([
                'message' => 'El puerto está en uso por documentos existentes: se desactivó en lugar de eliminarse.',
                'desactivado' => true,
            ]);
        }

        $puerto->delete();

        return response()->json(['message' => 'Eliminado']);
    }
}
