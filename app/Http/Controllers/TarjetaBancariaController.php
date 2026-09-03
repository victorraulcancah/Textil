<?php

namespace App\Http\Controllers;

use App\Models\TarjetaBancaria;
use Illuminate\Http\Request;

class TarjetaBancariaController extends Controller
{
    public function index()
    {
        return response()->json(
            TarjetaBancaria::with('cuentaBancaria.banco:id,nombre')->latest('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        return response()->json(
            TarjetaBancaria::create($data)->load('cuentaBancaria.banco:id,nombre'),
            201
        );
    }

    public function show(TarjetaBancaria $tarjetas_bancaria)
    {
        return response()->json($tarjetas_bancaria->load('cuentaBancaria.banco:id,nombre'));
    }

    public function update(Request $request, TarjetaBancaria $tarjetas_bancaria)
    {
        $tarjetas_bancaria->update($this->validated($request));
        return response()->json($tarjetas_bancaria->load('cuentaBancaria.banco:id,nombre'));
    }

    public function destroy(TarjetaBancaria $tarjetas_bancaria)
    {
        $tarjetas_bancaria->delete();
        return response()->json(['message' => 'Eliminado']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'cuenta_bancaria_id' => 'required|exists:cuentas_bancarias,id',
            'tipo_tarjeta' => 'required|in:debito,credito',
            'nombre_referencial' => 'required|string|max:255',
            'numero_enmascarado' => 'required|string|max:20',
            'marca' => 'required|string|max:50',
            'fecha_vencimiento' => 'nullable|string|max:10',
            'titular' => 'nullable|string|max:255',
            'limite_credito' => 'nullable|numeric|min:0',
            'estado' => 'required|in:activa,bloqueada,vencida',
        ]);
    }
}
