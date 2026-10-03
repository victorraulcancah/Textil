<?php

namespace App\Http\Controllers;

use App\Models\Caja;
use App\Models\User;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CajaController extends Controller
{
    private const WITH = [
        'almacen:id,nombre,numero_serie',
        'cuentasBancarias:id,banco_id,alias,numero_cuenta,titular',
        'cuentasBancarias.banco:id,nombre',
        'billeteras:id,nombre,numero_asociado,titular',
        'usuario:id,name,email,caja_id',
    ];

    /** Cada sucursal ve las cajas de su almacén; el Super Admin ve todas (o las de un almacén si lo pide). */
    public function index(Request $request)
    {
        $consulta = Caja::with(self::WITH)->orderBy('codigo')->orderBy('nombre');

        if (AlmacenAcceso::irrestricto()) {
            $consulta->when($request->filled('almacen_id'), fn ($q) => $q->where('almacen_id', $request->integer('almacen_id')));
        } else {
            AlmacenAcceso::limitar($consulta);
        }

        return response()->json($consulta->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $almacenId = AlmacenAcceso::resolver($data['almacen_id'] ?? null);
        if (! $almacenId) {
            throw ValidationException::withMessages(['almacen_id' => 'Elige el almacén al que pertenece la caja.']);
        }

        $caja = DB::transaction(function () use ($data, $almacenId) {
            $caja = Caja::create($this->cajaData($data) + [
                'almacen_id' => $almacenId,
                'codigo' => Caja::siguienteCodigo($almacenId),
            ]);
            $this->syncRelaciones($caja, $data);
            $this->assignUsuario($caja, $data['usuario_id'] ?? null);

            return $caja;
        });

        return response()->json($caja->load(self::WITH), 201);
    }

    public function show(Caja $caja)
    {
        return response()->json($caja->load(self::WITH));
    }

    public function update(Request $request, Caja $caja)
    {
        AlmacenAcceso::exigir($caja->almacen_id);
        $data = $this->validated($request);

        DB::transaction(function () use ($caja, $data) {
            $cambios = $this->cajaData($data);

            // Una caja se mueve de almacén solo mientras no tenga historia: sus aperturas y movimientos son de la
            // sucursal donde se hicieron. Al moverla recibe el código del almacén nuevo.
            $nuevo = AlmacenAcceso::irrestricto() && ! empty($data['almacen_id']) ? (int) $data['almacen_id'] : null;
            if ($nuevo && (int) $caja->almacen_id !== $nuevo) {
                if ($caja->aperturas()->exists()) {
                    throw ValidationException::withMessages(['almacen_id' => 'Esta caja ya tiene aperturas: no se puede pasar a otro almacén.']);
                }
                $cambios += ['almacen_id' => $nuevo, 'codigo' => Caja::siguienteCodigo($nuevo)];
            }

            $caja->update($cambios);
            $this->syncRelaciones($caja, $data);
            $this->assignUsuario($caja, $data['usuario_id'] ?? null);
        });

        return response()->json($caja->fresh()->load(self::WITH));
    }

    public function destroy(Caja $caja)
    {
        AlmacenAcceso::exigir($caja->almacen_id);
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
            // El usuario trabaja en un almacén: su caja tiene que ser de ese mismo almacén.
            $usuario = User::findOrFail($usuarioId);
            if ($usuario->almacen_id && (int) $usuario->almacen_id !== (int) $caja->almacen_id) {
                throw ValidationException::withMessages([
                    'usuario_id' => "{$usuario->name} trabaja en otro almacén: solo puede tener una caja de su almacén.",
                ]);
            }
            $usuario->update(['caja_id' => $caja->id]);
        }
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'nombre' => 'required|string|max:255',
            'almacen_id' => 'nullable|exists:almacenes,id',
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
