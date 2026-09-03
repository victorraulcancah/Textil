<?php

namespace App\Http\Controllers;

use App\Models\CuentaBancaria;
use Illuminate\Http\Request;

class CuentaBancariaController extends Controller
{
    public function index()
    {
        return response()->json(
            CuentaBancaria::with('banco:id,nombre')->withCount('tarjetas')->latest('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        return response()->json(CuentaBancaria::create($data)->load('banco:id,nombre'), 201);
    }

    public function show(CuentaBancaria $cuentas_bancaria)
    {
        return response()->json($cuentas_bancaria->load('banco:id,nombre'));
    }

    public function update(Request $request, CuentaBancaria $cuentas_bancaria)
    {
        $cuentas_bancaria->update($this->validated($request));
        return response()->json($cuentas_bancaria->load('banco:id,nombre'));
    }

    public function destroy(CuentaBancaria $cuentas_bancaria)
    {
        $cuentas_bancaria->delete();
        return response()->json(['message' => 'Eliminado']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'banco_id' => 'required|exists:bancos,id',
            'alias' => 'nullable|string|max:255',
            'numero_cuenta' => 'required|string|max:255',
            'cci' => 'nullable|string|max:255',
            'titular' => 'nullable|string|max:255',
            'moneda' => 'required|in:PEN,USD',
            'tipo_cuenta' => 'required|in:corriente,ahorros',
            'activo' => 'boolean',
        ]);
    }
}
