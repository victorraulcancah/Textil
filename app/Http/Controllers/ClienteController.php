<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
use Illuminate\Http\Request;

class ClienteController extends Controller
{
    public function index()
    {
        return response()->json(Cliente::where('activo', true)->latest('id')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'tipo_documento' => 'nullable|string|max:20',
            'numero_documento' => 'nullable|string|max:20',
            'direccion' => 'nullable|string|max:255',
            'telefono' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
        ]);
        return response()->json(Cliente::create($data), 201);
    }

    public function show(Cliente $cliente)
    {
        return response()->json($cliente);
    }

    public function update(Request $request, Cliente $cliente)
    {
        $data = $request->validate([
            'nombre' => 'string|max:255',
            'tipo_documento' => 'nullable|string|max:20',
            'numero_documento' => 'nullable|string|max:20',
            'direccion' => 'nullable|string|max:255',
            'telefono' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
            'activo' => 'boolean',
        ]);
        $cliente->update($data);
        return response()->json($cliente);
    }

    public function destroy(Cliente $cliente)
    {
        $cliente->update(['activo' => false]);
        return response()->json(['message' => 'Cliente desactivado correctamente']);
    }
}
