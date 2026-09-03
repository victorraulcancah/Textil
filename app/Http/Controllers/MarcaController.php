<?php

namespace App\Http\Controllers;

use App\Http\Resources\MarcaResource;
use App\Models\Marca;
use Illuminate\Http\Request;

class MarcaController extends Controller
{
    public function index()
    {
        return MarcaResource::collection(Marca::orderBy('nombre')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'logo' => 'nullable|string|max:255',
            'activo' => 'boolean',
        ]);

        return new MarcaResource(Marca::create($data));
    }

    public function show(Marca $marca)
    {
        return new MarcaResource($marca);
    }

    public function update(Request $request, Marca $marca)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'logo' => 'nullable|string|max:255',
            'activo' => 'boolean',
        ]);
        $marca->update($data);

        return new MarcaResource($marca);
    }

    public function destroy(Marca $marca)
    {
        $marca->delete();

        return response()->json(['message' => 'Marca eliminada']);
    }
}
