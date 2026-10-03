<?php

namespace App\Http\Controllers;

use App\Models\TarjetaBancaria;
use App\Models\CuentaBancaria;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;

class TarjetaBancariaController extends Controller
{
    public function index()
    {
        // Una tarjeta es del almacén de su cuenta.
        return response()->json(
            TarjetaBancaria::with('cuentaBancaria.banco:id,nombre')
                ->whereHas('cuentaBancaria', fn ($c) => AlmacenAcceso::limitar($c))
                ->latest('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        AlmacenAcceso::exigir(CuentaBancaria::whereKey($data['cuenta_bancaria_id'])->value('almacen_id'));
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
        AlmacenAcceso::exigir($tarjetas_bancaria->cuentaBancaria?->almacen_id);
        $data = $this->validated($request);
        AlmacenAcceso::exigir(CuentaBancaria::whereKey($data['cuenta_bancaria_id'])->value('almacen_id'));
        $tarjetas_bancaria->update($data);
        return response()->json($tarjetas_bancaria->load('cuentaBancaria.banco:id,nombre'));
    }

    public function destroy(TarjetaBancaria $tarjetas_bancaria)
    {
        AlmacenAcceso::exigir($tarjetas_bancaria->cuentaBancaria?->almacen_id);
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
