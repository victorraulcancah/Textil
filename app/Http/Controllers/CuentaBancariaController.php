<?php

namespace App\Http\Controllers;

use App\Models\CuentaBancaria;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CuentaBancariaController extends Controller
{
    public function index()
    {
        // Tesorería por sucursal: cada almacén ve las cuentas del suyo.
        return response()->json(
            AlmacenAcceso::limitar(CuentaBancaria::with('banco:id,nombre', 'almacen:id,nombre')->withCount('tarjetas'))
                ->latest('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['almacen_id'] = AlmacenAcceso::resolver($request->integer('almacen_id') ?: null);
        if (! $data['almacen_id']) {
            throw ValidationException::withMessages(['almacen_id' => 'Elige el almacén de la cuenta.']);
        }

        return response()->json(CuentaBancaria::create($data)->load('banco:id,nombre', 'almacen:id,nombre'), 201);
    }

    public function show(CuentaBancaria $cuentas_bancaria)
    {
        return response()->json($cuentas_bancaria->load('banco:id,nombre', 'almacen:id,nombre'));
    }

    public function update(Request $request, CuentaBancaria $cuentas_bancaria)
    {
        AlmacenAcceso::exigir($cuentas_bancaria->almacen_id);
        $cuentas_bancaria->update($this->validated($request));
        return response()->json($cuentas_bancaria->load('banco:id,nombre', 'almacen:id,nombre'));
    }

    public function destroy(CuentaBancaria $cuentas_bancaria)
    {
        AlmacenAcceso::exigir($cuentas_bancaria->almacen_id);
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
