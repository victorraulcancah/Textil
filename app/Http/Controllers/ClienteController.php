<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
use App\Models\ClienteDireccion;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ClienteController extends Controller
{
    private const RELACIONES = [
        'ejecutivo:id,name',
        'tipoPrecio:id,nombre',
        'categoriaComercial:id,nombre',
        'actividadComercial:id,nombre',
        'direcciones',
    ];

    public function index(Request $request)
    {
        $query = Cliente::with(self::RELACIONES)->where('activo', true);

        // Sin "ver todo", cada quien ve solo los clientes que tiene a cargo.
        // Los que no tienen ejecutivo asignado nadie los ve por esta vía —
        // hay que asignarlos primero— salvo quien sí tenga "ver todo".
        if (! $this->puedeVerTodo($request)) {
            $query->where('ejecutivo_id', $request->user()->id);
        }

        return response()->json($query->latest('id')->get());
    }

    public function store(Request $request)
    {
        $data = $this->validar($request);

        $cliente = DB::transaction(function () use ($data) {
            $direcciones = Cliente::normalizarDirecciones($data['direcciones'] ?? []);
            // Como antes, todo cliente nuevo nace activo.
            $cliente = Cliente::create([
                ...Arr::except($data, ['direcciones', 'activo']),
                // Sin código escrito, el siguiente correlativo.
                'codigo' => ($data['codigo'] ?? null) ?: Cliente::siguienteCodigo(),
                'direccion' => Cliente::direccionPredeterminada($direcciones),
            ]);
            $cliente->guardarDirecciones($direcciones);

            return $cliente;
        });

        return response()->json($cliente->load(self::RELACIONES), 201);
    }

    public function show(Cliente $cliente)
    {
        return response()->json($cliente->load(self::RELACIONES));
    }

    public function update(Request $request, Cliente $cliente)
    {
        $data = $this->validar($request, $cliente);

        DB::transaction(function () use ($cliente, $data) {
            $cambios = Arr::except($data, ['direcciones']);
            // El código no se queda vacío: si lo borran, sigue el que tenía.
            if (array_key_exists('codigo', $cambios) && blank($cambios['codigo'])) {
                $cambios['codigo'] = $cliente->codigo ?: Cliente::siguienteCodigo();
            }

            $direcciones = null;
            if (array_key_exists('direcciones', $data)) {
                $direcciones = Cliente::normalizarDirecciones($data['direcciones']);
                $cambios['direccion'] = Cliente::direccionPredeterminada($direcciones);
            }

            $cliente->update($cambios);
            if ($direcciones !== null) {
                $cliente->guardarDirecciones($direcciones);
            }
        });

        return response()->json($cliente->load(self::RELACIONES));
    }

    public function destroy(Cliente $cliente)
    {
        $cliente->update(['activo' => false]);
        return response()->json(['message' => 'Cliente desactivado correctamente']);
    }

    private function validar(Request $request, ?Cliente $cliente = null): array
    {
        $data = $request->validate([
            'codigo' => ['nullable', 'string', 'max:20', Rule::unique('clientes', 'codigo')->ignore($cliente?->id)],
            'nombre' => ($cliente ? 'sometimes|' : '').'required|string|max:255',
            'tipo_documento' => 'nullable|string|max:20',
            'numero_documento' => 'nullable|string|max:20',
            'telefono' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
            'zona' => 'nullable|string|max:100',
            'actividad_comercial_id' => 'nullable|exists:actividades_comerciales,id',
            'categoria_comercial_id' => 'nullable|exists:categorias_comerciales,id',
            'tipo_cliente' => ['sometimes', Rule::in(Cliente::TIPOS_CLIENTE)],
            'ejecutivo_id' => 'nullable|exists:users,id',
            // A qué precio se le vende; sin uno, al principal.
            'tipo_precio_id' => 'nullable|exists:tipos_precio,id',
            'activo' => 'boolean',

            'direcciones' => 'sometimes|array',
            'direcciones.*.id' => 'nullable|integer',
            'direcciones.*.tipo' => ['required', Rule::in(ClienteDireccion::TIPOS)],
            'direcciones.*.predeterminada' => 'sometimes|boolean',
            'direcciones.*.direccion' => 'required|string|max:255',
            'direcciones.*.referencia' => 'nullable|string|max:255',
            'direcciones.*.pais' => 'nullable|string|max:60',
            'direcciones.*.departamento' => 'nullable|string|max:60',
            'direcciones.*.provincia' => 'nullable|string|max:60',
            'direcciones.*.distrito' => 'nullable|string|max:80',
            'direcciones.*.ubigeo' => 'nullable|digits:6|exists:ubigeos,ubigeo',
            'direcciones.*.codigo_postal' => 'nullable|string|max:10',
        ], [
            'codigo.unique' => 'Ya hay otro cliente con ese código.',
            'direcciones.*.direccion.required' => 'Escribe la dirección.',
            'direcciones.*.ubigeo.digits' => 'El ubigeo tiene 6 dígitos.',
            'direcciones.*.ubigeo.exists' => 'Ese ubigeo no existe.',
        ]);

        $direcciones = collect($data['direcciones'] ?? []);
        if ($direcciones->where('tipo', ClienteDireccion::FISCAL)->count() > 1) {
            throw ValidationException::withMessages(['direcciones' => 'Solo puede haber una dirección fiscal.']);
        }
        if ($direcciones->filter(fn ($d) => ! empty($d['predeterminada']))->count() > 1) {
            throw ValidationException::withMessages(['direcciones' => 'Solo una dirección puede ser la predeterminada.']);
        }

        return $data;
    }

    /** El super-admin y quien tenga el permiso "ver todo" ven la cartera completa. */
    private function puedeVerTodo(Request $request): bool
    {
        $user = $request->user();

        return $user->hasRole(config('permisos.super_admin')) || $user->can('ventas.clientes.ver_todo');
    }
}
