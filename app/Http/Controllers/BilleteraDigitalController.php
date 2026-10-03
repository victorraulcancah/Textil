<?php

namespace App\Http\Controllers;

use App\Models\BilleteraDigital;
use App\Models\CuentaBancaria;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class BilleteraDigitalController extends Controller
{
    public function index()
    {
        // Tesorería por sucursal: cada almacén ve las billeteras del suyo.
        return response()->json(
            AlmacenAcceso::limitar(BilleteraDigital::with('cuentaBancaria.banco:id,nombre', 'almacen:id,nombre'))
                ->latest('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['almacen_id'] = AlmacenAcceso::resolver($request->integer('almacen_id') ?: null);
        if (! $data['almacen_id']) {
            throw ValidationException::withMessages(['almacen_id' => 'Elige el almacén de la billetera.']);
        }
        $this->exigirCuentaDelAlmacen($data['cuenta_bancaria_id'] ?? null, $data['almacen_id']);
        $data['qr'] = $this->handleQr($request);
        return response()->json(
            BilleteraDigital::create($data)->load('cuentaBancaria.banco:id,nombre', 'almacen:id,nombre'),
            201
        );
    }

    public function show(BilleteraDigital $billeteras_digitale)
    {
        return response()->json($billeteras_digitale->load('cuentaBancaria.banco:id,nombre'));
    }

    public function update(Request $request, BilleteraDigital $billeteras_digitale)
    {
        AlmacenAcceso::exigir($billeteras_digitale->almacen_id);
        $data = $this->validated($request);
        $this->exigirCuentaDelAlmacen($data['cuenta_bancaria_id'] ?? null, $billeteras_digitale->almacen_id);
        $qr = $this->handleQr($request);
        if ($qr !== null) {
            $data['qr'] = $qr;
        }
        $billeteras_digitale->update($data);
        return response()->json($billeteras_digitale->load('cuentaBancaria.banco:id,nombre'));
    }

    public function destroy(BilleteraDigital $billeteras_digitale)
    {
        AlmacenAcceso::exigir($billeteras_digitale->almacen_id);
        $billeteras_digitale->delete();
        return response()->json(['message' => 'Eliminado']);
    }

    /** La cuenta a la que se asocia una billetera tiene que ser del mismo almacén. */
    private function exigirCuentaDelAlmacen(?int $cuentaId, ?int $almacenId): void
    {
        if ($cuentaId && (int) CuentaBancaria::whereKey($cuentaId)->value('almacen_id') !== (int) $almacenId) {
            throw ValidationException::withMessages(['cuenta_bancaria_id' => 'Esa cuenta es de otro almacén.']);
        }
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
