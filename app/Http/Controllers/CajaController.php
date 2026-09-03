<?php

namespace App\Http\Controllers;

use App\Models\Caja;
use App\Models\User;
use Illuminate\Http\Request;

class CajaController extends Controller
{
    private const WITH = [
        'cuentasBancarias:id,banco_id,alias,numero_cuenta,titular',
        'cuentasBancarias.banco:id,nombre',
        'billeteras:id,nombre,numero_asociado,titular',
        'usuario:id,name,email,caja_id',
    ];

    public function index()
    {
        return response()->json(Caja::with(self::WITH)->orderBy('nombre')->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $caja = Caja::create($this->cajaData($data));
        $this->syncRelaciones($caja, $data);
        $this->assignUsuario($caja, $data['usuario_id'] ?? null);

        return response()->json($caja->load(self::WITH), 201);
    }

    public function show(Caja $caja)
    {
        return response()->json($caja->load(self::WITH));
    }

    public function update(Request $request, Caja $caja)
    {
        $data = $this->validated($request);
        $caja->update($this->cajaData($data));
        $this->syncRelaciones($caja, $data);
        $this->assignUsuario($caja, $data['usuario_id'] ?? null);

        return response()->json($caja->load(self::WITH));
    }

    public function destroy(Caja $caja)
    {
        User::where('caja_id', $caja->id)->update(['caja_id' => null]);
        $caja->delete();
        return response()->json(['message' => 'Eliminado']);
    }

    private function cajaData(array $data): array
    {
        return [
            'nombre' => $data['nombre'],
            'acepta_efectivo' => $data['acepta_efectivo'] ?? false,
            'activo' => $data['activo'] ?? true,
        ];
    }

    private function syncRelaciones(Caja $caja, array $data): void
    {
        $caja->cuentasBancarias()->sync($data['cuentas_bancarias'] ?? []);
        $caja->billeteras()->sync($data['billeteras'] ?? []);
    }

    private function assignUsuario(Caja $caja, ?int $usuarioId): void
    {
        User::where('caja_id', $caja->id)->update(['caja_id' => null]);
        if ($usuarioId) {
            User::where('id', $usuarioId)->update(['caja_id' => $caja->id]);
        }
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'nombre' => 'required|string|max:255',
            'acepta_efectivo' => 'boolean',
            'activo' => 'boolean',
            'usuario_id' => 'nullable|exists:users,id',
            'cuentas_bancarias' => 'nullable|array',
            'cuentas_bancarias.*' => 'exists:cuentas_bancarias,id',
            'billeteras' => 'nullable|array',
            'billeteras.*' => 'exists:billeteras_digitales,id',
        ]);
    }
}
