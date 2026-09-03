<?php

namespace App\Http\Controllers;

use App\Models\SubMarca;
use Illuminate\Http\Request;

class SubMarcaController extends Controller
{
    public function index()
    {
        return response()->json(
            SubMarca::with('marca:id,nombre')->orderBy('nombre')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'marca_id' => 'required|exists:marcas,id',
            'nombre' => 'required|string|max:255',
            'activo' => 'boolean',
        ]);

        return response()->json(SubMarca::create($data), 201);
    }

    public function show(int $id)
    {
        return response()->json(SubMarca::with('marca:id,nombre')->findOrFail($id));
    }

    public function update(Request $request, int $id)
    {
        $sub = SubMarca::findOrFail($id);
        $data = $request->validate([
            'marca_id' => 'required|exists:marcas,id',
            'nombre' => 'required|string|max:255',
            'activo' => 'boolean',
        ]);
        $sub->update($data);

        return response()->json($sub);
    }

    public function destroy(int $id)
    {
        SubMarca::findOrFail($id)->delete();

        return response()->json(['message' => 'Sub-marca eliminada']);
    }
}
