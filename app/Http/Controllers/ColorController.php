<?php

namespace App\Http\Controllers;

use App\Models\Color;
use Illuminate\Http\Request;

/**
 * El catálogo compartido de colores: se crea una vez y todas las telas lo
 * referencian, en vez de que cada producto tenga su propio "Camello" suelto.
 */
class ColorController extends Controller
{
    public function index()
    {
        return Color::orderBy('codigo')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:100',
            // Si no se manda, se asigna el siguiente libre.
            'codigo' => 'nullable|string|size:4|unique:colores,codigo',
            'hex' => 'nullable|string|max:7',
            'activo' => 'boolean',
        ]);

        $data['codigo'] = $data['codigo'] ?? Color::generarCodigo();

        return response()->json(Color::create($data), 201);
    }

    // El parámetro de ruta se llama "colore" (Laravel singulariza "colores" a
    // secas, igual que "almacenes" -> "almacene" en el resto del proyecto).
    public function update(Request $request, Color $colore)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:100',
            'hex' => 'nullable|string|max:7',
            'activo' => 'boolean',
        ]);

        $colore->update($data);

        return response()->json($colore);
    }

    /** Solo se borra si ninguna tela lo está usando: si no, se pierde la trazabilidad. */
    public function destroy(Color $colore)
    {
        if ($colore->productoColores()->exists()) {
            return response()->json([
                'message' => "\"{$colore->nombre}\" ya está asignado a una o más telas: no se puede eliminar.",
            ], 409);
        }

        $colore->delete();

        return response()->json(['message' => 'Color eliminado']);
    }
}
