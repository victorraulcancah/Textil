<?php

namespace App\Http\Controllers;

use App\Models\BilleteraDigital;
use Illuminate\Http\Request;

class BilleteraDigitalController extends Controller
{
    public function index()
    {
        return response()->json(
            BilleteraDigital::with('cuentaBancaria.banco:id,nombre')->latest('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['qr'] = $this->handleQr($request);
        return response()->json(
            BilleteraDigital::create($data)->load('cuentaBancaria.banco:id,nombre'),
            201
        );
    }

    public function show(BilleteraDigital $billeteras_digitale)
    {
        return response()->json($billeteras_digitale->load('cuentaBancaria.banco:id,nombre'));
    }

    public function update(Request $request, BilleteraDigital $billeteras_digitale)
    {
        $data = $this->validated($request);
        $qr = $this->handleQr($request);
        if ($qr !== null) {
            $data['qr'] = $qr;
        }
        $billeteras_digitale->update($data);
        return response()->json($billeteras_digitale->load('cuentaBancaria.banco:id,nombre'));
    }

    public function destroy(BilleteraDigital $billeteras_digitale)
    {
        $billeteras_digitale->delete();
        return response()->json(['message' => 'Eliminado']);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'numero_asociado' => 'required|string|max:255',
            'cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'titular' => 'nullable|string|max:255',
            'qr' => 'nullable|image|max:2048',
            'requiere_captura' => 'boolean',
            'requiere_numero_operacion' => 'boolean',
            'activo' => 'boolean',
        ]);
        unset($data['qr']); // el archivo se procesa aparte
        return $data;
    }

    /**
     * Guarda el QR si viene un archivo nuevo y devuelve su ruta pública.
     * Devuelve null si no se envió archivo (para no sobreescribir el existente).
     */
    private function handleQr(Request $request): ?string
    {
        if (! $request->hasFile('qr')) {
            return null;
        }
        return $request->file('qr')->store('qrs', 'public');
    }
}
