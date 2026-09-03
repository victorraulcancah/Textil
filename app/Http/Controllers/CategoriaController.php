<?php

namespace App\Http\Controllers;

use App\Http\Resources\CategoriaResource;
use App\Models\Categoria;
use Illuminate\Http\Request;

class CategoriaController extends Controller
{
    public function index()
    {
        return CategoriaResource::collection(Categoria::orderBy('nombre')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'categoria_padre_id' => 'nullable|exists:categorias,id',
            'nivel' => 'nullable|integer|min:1',
            'activo' => 'boolean',
        ]);
        $data['nivel'] = $data['nivel'] ?? 1;

        return new CategoriaResource(Categoria::create($data));
    }

    public function show(Categoria $categoria)
    {
        return new CategoriaResource($categoria);
    }

    public function update(Request $request, Categoria $categoria)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'categoria_padre_id' => 'nullable|exists:categorias,id',
            'nivel' => 'nullable|integer|min:1',
            'activo' => 'boolean',
        ]);
        $categoria->update($data);

        return new CategoriaResource($categoria);
    }

    public function destroy(Categoria $categoria)
    {
        $categoria->delete();

        return response()->json(['message' => 'Categoría eliminada']);
    }
}
