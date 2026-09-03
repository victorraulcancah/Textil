<?php

namespace App\Http\Controllers;

use App\Http\Requests\Empresa\StoreEmpresaRequest;
use App\Http\Requests\Empresa\UpdateEmpresaRequest;
use App\Models\Empresa;
use Illuminate\Http\JsonResponse;

class EmpresaController extends Controller
{
    public function __construct()
    {
    }

    public function index(): JsonResponse
    {
        return response()->json(Empresa::with('users')->latest('id')->get());
    }

    public function store(StoreEmpresaRequest $request): JsonResponse
    {
        $empresa = Empresa::create($request->validated());

        return response()->json($empresa, 201);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(Empresa::with('users')->findOrFail($id));
    }

    public function update(UpdateEmpresaRequest $request, int $id): JsonResponse
    {
        $empresa = Empresa::findOrFail($id);
        $empresa->update($request->validated());

        return response()->json($empresa->load('users'));
    }

    public function destroy(int $id): JsonResponse
    {
        Empresa::findOrFail($id)->delete();

        return response()->json(null, 204);
    }
}
