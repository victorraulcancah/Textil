<?php

namespace App\Http\Controllers;

use App\Http\Resources\UnidadMedidaResource;
use App\Models\UnidadMedida;
use Illuminate\Http\Request;

class UnidadMedidaController extends Controller
{
    public function __construct()
    {
    }

    public function index()
    {
        return UnidadMedidaResource::collection(UnidadMedida::latest('id')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'abreviatura' => 'required|string|max:50',
            'factor_base' => 'nullable|numeric|min:0.0001',
        ]);
        return new UnidadMedidaResource(UnidadMedida::create($data));
    }

    public function show(UnidadMedida $unidadesMedida)
    {
        return new UnidadMedidaResource($unidadesMedida);
    }

    public function update(Request $request, UnidadMedida $unidadesMedida)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'abreviatura' => 'required|string|max:50',
            'factor_base' => 'nullable|numeric|min:0.0001',
        ]);
        $unidadesMedida->update($data);
        return new UnidadMedidaResource($unidadesMedida);
    }

    public function destroy(UnidadMedida $unidadesMedida)
    {
        $unidadesMedida->delete();
        return response()->json(['message' => 'Eliminado']);
    }
}
