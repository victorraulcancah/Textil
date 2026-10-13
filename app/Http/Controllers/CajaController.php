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
        'usuarios:id,name,email',
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

        // Los medios de pago ya no se eligen por caja: todas aceptan los de la empresa.
        return response()->json(Caja::conMediosDePago($consulta->get()));
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
            $this->asignarUsuarios($caja, $data['usuarios'] ?? []);

            return $caja;
        });

        return response()->json(Caja::conMediosDePago($caja->load(self::WITH)), 201);
    }

    public function show(Caja $caja)
    {
        return response()->json(Caja::conMediosDePago($caja->load(self::WITH)));
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
            // Si no se manda la lista, los usuarios no se tocan.
            if (array_key_exists('usuarios', $data)) {
                $this->asignarUsuarios($caja, $data['usuarios'] ?? []);
            }
        });

        return response()->json(Caja::conMediosDePago($caja->fresh()->load(self::WITH)));
    }

    public function destroy(Caja $caja)
    {
        AlmacenAcceso::exigir($caja->almacen_id);
        if ($caja->aperturaAbierta()) {
            throw ValidationException::withMessages(['caja' => 'La caja está abierta: ciérrala antes de eliminarla.']);
        }
        $this->asignarUsuarios($caja, []);
        $caja->delete();
        return response()->json(['message' => 'Eliminado']);
    }

    private function cajaData(array $data): array
    {
        return [
            'nombre' => $data['nombre'],
            // Toda caja recibe efectivo: ya no es una opción.
            'acepta_efectivo' => true,
            'activo' => $data['activo'] ?? true,
        ];
    }

    /**
     * Los usuarios que gestionan la caja (turnos). Cada usuario tiene una sola caja por almacén; con una caja en un
     * almacén puede trabajar en él. Quien tiene la caja abierta en este momento no se puede quitar.
     *
     * @param  list<int>  $ids
     */
    private function asignarUsuarios(Caja $caja, array $ids): void
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        $actuales = $caja->usuarios()->pluck('users.id')->map(fn ($i) => (int) $i)->all();

        foreach (array_diff($ids, $actuales) as $nuevoId) {
            $usuario = User::findOrFail($nuevoId);
            $otra = $usuario->cajas()->where('cajas.almacen_id', $caja->almacen_id)->where('cajas.id', '!=', $caja->id)->first();
            if ($otra) {
                throw ValidationException::withMessages([
                    'usuarios' => "{$usuario->name} ya tiene la caja {$otra->codigo} en este almacén: cada usuario tiene una por almacén.",
                ]);
            }
        }

        $quitados = array_diff($actuales, $ids);
        $abierta = $caja->aperturaAbierta();
        if ($abierta && in_array((int) $abierta->usuario_id, $quitados, true)) {
            throw ValidationException::withMessages(['usuarios' => 'Ese usuario tiene la caja abierta ahora: que la cierre antes de quitársela.']);
        }

        $caja->usuarios()->sync($ids);

        // Con una caja en este almacén, el usuario puede trabajar en él; sin ella, deja de poder (salvo su almacén principal).
        foreach (array_diff($ids, $actuales) as $nuevoId) {
            User::find($nuevoId)?->almacenes()->syncWithoutDetaching([$caja->almacen_id]);
        }
        foreach ($quitados as $quitadoId) {
            $u = User::find($quitadoId);
            if ($u && (int) $u->almacen_id !== (int) $caja->almacen_id) {
                $u->almacenes()->detach($caja->almacen_id);
            }
        }
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'nombre' => 'required|string|max:255',
            'almacen_id' => 'nullable|exists:almacenes,id',
            'activo' => 'boolean',
            'usuarios' => 'nullable|array',
            'usuarios.*' => 'integer|exists:users,id',
        ]);
    }
}
