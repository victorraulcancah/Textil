<?php

namespace App\Http\Controllers;

use App\Models\CategoriaComercial;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CategoriaComercialController extends Controller
{
    public function index()
    {
        return response()->json(CategoriaComercial::withCount('clientes')->orderBy('nombre')->get());
    }

    /** Las activas, para elegir en el cliente: va con el permiso de Clientes. */
    public function opciones()
    {
        return response()->json(CategoriaComercial::where('activo', true)->orderBy('nombre')->get(['id', 'nombre']));
    }

    public function store(Request $request)
    {
        return response()->json(CategoriaComercial::create($this->validar($request)), 201);
    }

    public function update(Request $request, CategoriaComercial $categoriaComercial)
    {
        $categoriaComercial->update($this->validar($request, $categoriaComercial));

        return response()->json($categoriaComercial);
    }

    public function destroy(CategoriaComercial $categoriaComercial)
    {
        // Si algún cliente la tiene, se desactiva: borrarla lo dejaría sin categoría.
        if ($categoriaComercial->clientes()->exists()) {
            $categoriaComercial->update(['activo' => false]);

            return response()->json([
                'message' => 'La usan clientes: se desactivó en lugar de eliminarse.',
                'desactivado' => true,
            ]);
        }

        $categoriaComercial->delete();

        return response()->json(['message' => 'Eliminada']);
    }

    private function validar(Request $request, ?CategoriaComercial $categoria = null): array
    {
        return $request->validate([
            'nombre' => ['required', 'string', 'max:150', Rule::unique('categorias_comerciales', 'nombre')->ignore($categoria?->id)],
            'activo' => 'boolean',
        ], [
            'nombre.unique' => 'Ya existe esa categoría.',
        ]);
    }
}
