<?php

namespace App\Http\Controllers;

use App\Models\Banco;
use Illuminate\Http\Request;

class BancoController extends Controller
{
    public function index()
    {
        return response()->json(Banco::withCount('cuentas')->orderBy('nombre')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'activo' => 'boolean',
        ]);
        return response()->json(Banco::create($data), 201);
    }

    public function show(Banco $banco)
    {
        return response()->json($banco);
    }

    public function update(Request $request, Banco $banco)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'activo' => 'boolean',
        ]);
        $banco->update($data);
        return response()->json($banco);
    }

    public function destroy(Banco $banco)
    {
        $banco->delete();
        return response()->json(['message' => 'Eliminado']);
    }
}
