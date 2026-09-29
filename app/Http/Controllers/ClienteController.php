<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
use App\Models\ClienteDireccion;
use App\Models\LineaCredito;
use App\Services\CreditoService;
use App\Support\Permisos;
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
        // Condición de venta y días de crédito: la venta los necesita.
        'lineaCredito',
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
                ...Arr::except($data, ['direcciones', 'activo', 'linea_credito']),
                // Sin código escrito, el siguiente correlativo.
                'codigo' => ($data['codigo'] ?? null) ?: Cliente::siguienteCodigo(),
                'direccion' => Cliente::direccionPredeterminada($direcciones),
            ]);
            $cliente->guardarDirecciones($direcciones);
            $this->guardarLinea($cliente, $data);

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
            $cambios = Arr::except($data, ['direcciones', 'linea_credito']);
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
            $this->guardarLinea($cliente, $data);
        });

        return response()->json($cliente->load(self::RELACIONES));
    }

    /** La línea de crédito en uso: lo aprobado, lo que debe y lo disponible hoy. */
    public function credito(Cliente $cliente, CreditoService $credito)
    {
        return response()->json([
            'linea' => $cliente->lineaCredito,
            'resumen' => $credito->resumen($cliente),
        ]);
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

            // La línea de crédito viaja con el cliente; null la quita.
            'linea_credito' => 'sometimes|nullable|array',
            'linea_credito.moneda' => 'required_with:linea_credito|in:PEN,USD',
            'linea_credito.limite' => 'required_with:linea_credito|numeric|min:0',
            'linea_credito.fecha_aprobacion' => 'nullable|date',
            'linea_credito.vigente_hasta' => 'nullable|date',
            'linea_credito.activa' => 'boolean',
            'linea_credito.condicion_venta' => ['required_with:linea_credito', Rule::in([LineaCredito::CONTADO, LineaCredito::CREDITO])],
            'linea_credito.dias_credito' => 'nullable|integer|min:0|max:720',
            'linea_credito.dias_gracia' => 'nullable|integer|min:0|max:365',
            'linea_credito.ampliacion_tipo' => ['nullable', Rule::in([LineaCredito::AMPLIACION_IMPORTE, LineaCredito::AMPLIACION_PORCENTAJE])],
            'linea_credito.ampliacion_valor' => 'nullable|numeric|min:0',
            'linea_credito.ampliacion_hasta' => 'nullable|date',
            'linea_credito.observaciones' => 'nullable|string|max:2000',
        ], [
            'codigo.unique' => 'Ya hay otro cliente con ese código.',
            'direcciones.*.direccion.required' => 'Escribe la dirección.',
            'direcciones.*.ubigeo.digits' => 'El ubigeo tiene 6 dígitos.',
            'direcciones.*.ubigeo.exists' => 'Ese ubigeo no existe.',
            'linea_credito.limite.required_with' => 'Pon el límite de la línea de crédito.',
        ]);

        // Cuánto se le fía lo decide quien aprueba crédito, no cualquiera que
        // edite los datos del cliente.
        if (array_key_exists('linea_credito', $data) && ! Permisos::puede($request->user(), 'ventas.clientes.linea_credito')) {
            abort(403, 'No tienes permiso para aprobar líneas de crédito.');
        }

        $direcciones = collect($data['direcciones'] ?? []);
        if ($direcciones->where('tipo', ClienteDireccion::FISCAL)->count() > 1) {
            throw ValidationException::withMessages(['direcciones' => 'Solo puede haber una dirección fiscal.']);
        }
        if ($direcciones->filter(fn ($d) => ! empty($d['predeterminada']))->count() > 1) {
            throw ValidationException::withMessages(['direcciones' => 'Solo una dirección puede ser la predeterminada.']);
        }

        return $data;
    }

    /** Crea, actualiza o quita la línea de crédito, si vino en lo guardado. */
    private function guardarLinea(Cliente $cliente, array $data): void
    {
        if (! array_key_exists('linea_credito', $data)) {
            return;
        }

        $linea = $data['linea_credito'];
        if ($linea === null) {
            $cliente->lineaCredito()->delete();

            return;
        }

        // Sin tipo de ampliación no hay ampliación: ni valor ni fecha.
        if (empty($linea['ampliacion_tipo'])) {
            $linea = ['ampliacion_tipo' => null, 'ampliacion_valor' => 0, 'ampliacion_hasta' => null] + $linea;
        }

        $cliente->lineaCredito()->updateOrCreate(['cliente_id' => $cliente->id], [
            'moneda' => $linea['moneda'],
            'limite' => $linea['limite'],
            'fecha_aprobacion' => $linea['fecha_aprobacion'] ?? null,
            'vigente_hasta' => $linea['vigente_hasta'] ?? null,
            'activa' => (bool) ($linea['activa'] ?? true),
            'condicion_venta' => $linea['condicion_venta'],
            'dias_credito' => (int) ($linea['dias_credito'] ?? 0),
            'dias_gracia' => (int) ($linea['dias_gracia'] ?? 0),
            'ampliacion_tipo' => $linea['ampliacion_tipo'] ?? null,
            'ampliacion_valor' => (float) ($linea['ampliacion_valor'] ?? 0),
            'ampliacion_hasta' => $linea['ampliacion_hasta'] ?? null,
            'observaciones' => $linea['observaciones'] ?? null,
        ]);
        $cliente->unsetRelation('lineaCredito');
    }

    /** El super-admin y quien tenga el permiso "ver todo" ven la cartera completa. */
    private function puedeVerTodo(Request $request): bool
    {
        $user = $request->user();

        return $user->hasRole(config('permisos.super_admin')) || $user->can('ventas.clientes.ver_todo');
    }
}
