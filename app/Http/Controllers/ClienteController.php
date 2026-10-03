<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
use App\Models\ClienteDireccion;
use App\Models\CuentaPorCobrar;
use App\Models\LineaCredito;
use App\Models\NotaVenta;
use App\Models\OrdenVenta;
use App\Services\CreditoService;
use App\Support\Permisos;
use Illuminate\Http\Request;
use Carbon\Carbon;
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
        // Quién le bloqueó el crédito, si está bloqueado.
        'bloqueadoPor:id,name',
    ];

    public function index(Request $request, CreditoService $credito)
    {
        $query = Cliente::with(self::RELACIONES)->where('activo', true);

        // Los clientes son compartidos por todas las sucursales: quien puede ver Clientes los ve todos. El
        // ejecutivo asignado sigue siendo un dato del cliente, ya no un filtro de quién lo ve.

        // De la A a la Z por nombre o razón social.
        $clientes = $query->orderBy('nombre')->orderBy('id')->get();

        // El estado crediticio de cada uno (🟢 🟡 🔴 ⚫), calculado al momento.
        $estados = $credito->estados($clientes);
        $clientes->each(fn (Cliente $c) => $c->setAttribute('estado_credito', $estados[$c->id] ?? null));

        return response()->json($clientes);
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

    /**
     * Los documentos emitidos al cliente: sus proformas —con lo que
     * falta cobrar de cada una— y sus pedidos, de lo más reciente a lo más
     * antiguo. Sin fechas, todo.
     */
    public function documentos(Request $request, Cliente $cliente)
    {
        $fechas = $request->validate([
            'desde' => 'nullable|date',
            'hasta' => 'nullable|date|after_or_equal:desde',
        ]);
        $enRango = fn ($q) => $q
            ->when($fechas['desde'] ?? null, fn ($q, $d) => $q->whereDate('fecha_emision', '>=', $d))
            ->when($fechas['hasta'] ?? null, fn ($q, $h) => $q->whereDate('fecha_emision', '<=', $h));

        $porCobrar = CuentaPorCobrar::where('cliente_id', $cliente->id)
            ->whereIn('estado', ['pendiente', 'parcial'])
            ->selectRaw('nota_venta_id, SUM(saldo) AS saldo')
            ->groupBy('nota_venta_id')
            ->pluck('saldo', 'nota_venta_id');

        $notas = NotaVenta::where('cliente_id', $cliente->id)
            ->tap($enRango)
            ->with('ordenVenta:id,serie,numero')
            ->orderByDesc('fecha_emision')->orderByDesc('id')
            ->get()
            ->map(fn (NotaVenta $n) => [
                'id' => $n->id,
                'documento' => "{$n->serie}-{$n->numero}",
                'fecha' => $n->fecha_emision?->toDateString(),
                'moneda' => $n->moneda,
                'total' => (float) $n->total,
                'tipo_pago' => $n->tipo_pago,
                'estado' => $n->estado,
                'saldo' => round((float) ($porCobrar[$n->id] ?? 0), 2),
                'pedido' => $n->ordenVenta?->documento,
            ]);

        $pedidos = OrdenVenta::where('cliente_id', $cliente->id)
            ->tap($enRango)
            ->orderByDesc('fecha_emision')->orderByDesc('id')
            ->get()
            ->map(fn (OrdenVenta $o) => [
                'id' => $o->id,
                'documento' => $o->documento,
                'fecha' => $o->fecha_emision?->toDateString(),
                'moneda' => $o->moneda,
                'total' => (float) $o->total,
                'estado' => $o->estado,
                'estado_label' => OrdenVenta::ESTADOS[$o->estado] ?? $o->estado,
            ]);

        return response()->json(['notas_venta' => $notas, 'pedidos' => $pedidos]);
    }

    /**
     * Lo que compra el cliente en los últimos meses: cuánto y cuántas veces,
     * mes por mes, y los productos que más lleva; más lo de siempre (desde
     * cuándo compra, su última compra). Todo en soles: lo vendido en dólares
     * se lleva a soles con el tipo de cambio de su día. Solo ventas emitidas.
     */
    public function estadistica(Request $request, Cliente $cliente, CreditoService $credito)
    {
        $meses = (int) ($request->validate(['meses' => 'nullable|integer|in:3,6,12,24'])['meses'] ?? 12);
        $desde = now()->startOfMonth()->subMonths($meses - 1);

        $enSoles = "CASE WHEN nv.moneda = 'USD' THEN nv.total * COALESCE(nv.tipo_cambio, 1) ELSE nv.total END";
        $fx = "(CASE WHEN nv.moneda = 'USD' THEN COALESCE(nv.tipo_cambio, 1) ELSE 1 END)";

        $ventas = DB::table('notas_venta as nv')
            ->where('nv.cliente_id', $cliente->id)
            ->where('nv.estado', 'emitida');

        $siempre = (clone $ventas)->selectRaw("COUNT(*) AS compras, SUM({$enSoles}) AS total,
            MIN(nv.fecha_emision) AS primera, MAX(nv.fecha_emision) AS ultima")->first();

        $enPeriodo = (clone $ventas)->where('nv.fecha_emision', '>=', $desde->toDateString());
        $periodo = (clone $enPeriodo)->selectRaw("COUNT(*) AS compras, SUM({$enSoles}) AS total,
            SUM(CASE WHEN nv.tipo_pago = 'credito' THEN {$enSoles} ELSE 0 END) AS a_credito")->first();

        $porMes = (clone $enPeriodo)
            ->selectRaw("DATE_FORMAT(nv.fecha_emision, '%Y-%m') AS mes, COUNT(*) AS compras, SUM({$enSoles}) AS total")
            ->groupBy('mes')
            ->get()
            ->keyBy('mes');

        // Todos los meses del periodo, aunque en alguno no haya comprado.
        $serie = [];
        for ($mes = $desde->copy(); $mes->lte(now()); $mes->addMonth()) {
            $clave = $mes->format('Y-m');
            $serie[] = [
                'mes' => $clave,
                'compras' => (int) ($porMes[$clave]->compras ?? 0),
                'total' => round((float) ($porMes[$clave]->total ?? 0), 2),
            ];
        }

        $productos = DB::table('nota_venta_detalles as d')
            ->join('notas_venta as nv', 'nv.id', '=', 'd.nota_venta_id')
            ->join('producto_presentaciones as pp', 'pp.id', '=', 'd.producto_presentacion_id')
            ->join('productos as p', 'p.id', '=', 'pp.producto_id')
            ->leftJoin('unidades_medida as um', 'um.id', '=', 'p.unidad_medida_id')
            ->where('nv.cliente_id', $cliente->id)
            ->where('nv.estado', 'emitida')
            ->where('nv.fecha_emision', '>=', $desde->toDateString())
            ->groupBy('p.id', 'p.codigo', 'p.nombre', 'um.abreviatura')
            ->selectRaw("p.codigo, p.nombre, um.abreviatura AS unidad,
                SUM(d.cantidad * pp.factor_conversion) AS cantidad,
                SUM(d.subtotal * {$fx}) AS total,
                COUNT(DISTINCT nv.id) AS compras")
            ->orderByDesc('total')
            ->limit(10)
            ->get()
            ->map(fn ($p) => [
                'codigo' => $p->codigo,
                'nombre' => $p->nombre,
                'unidad' => $p->unidad,
                'cantidad' => round((float) $p->cantidad, 2),
                'total' => round((float) $p->total, 2),
                'compras' => (int) $p->compras,
            ]);

        $comprasPeriodo = (int) ($periodo->compras ?? 0);
        $totalPeriodo = round((float) ($periodo->total ?? 0), 2);

        return response()->json([
            'meses' => $meses,
            'desde' => $desde->toDateString(),
            'periodo' => [
                'compras' => $comprasPeriodo,
                'total' => $totalPeriodo,
                'ticket' => $comprasPeriodo > 0 ? round($totalPeriodo / $comprasPeriodo, 2) : 0,
                'a_credito' => round((float) ($periodo->a_credito ?? 0), 2),
            ],
            'siempre' => [
                'compras' => (int) ($siempre->compras ?? 0),
                'total' => round((float) ($siempre->total ?? 0), 2),
                'primera' => $siempre->primera ? Carbon::parse($siempre->primera)->toDateString() : null,
                'ultima' => $siempre->ultima ? Carbon::parse($siempre->ultima)->toDateString() : null,
            ],
            'por_mes' => $serie,
            'productos' => $productos,
            'credito' => $credito->resumen($cliente),
        ]);
    }

    /**
     * ⚫ Bloquea el crédito del cliente: nadie le vende a crédito, ni con
     * autorización, hasta que se desbloquee. Queda el motivo, quién y cuándo.
     */
    public function bloquearCredito(Request $request, Cliente $cliente, CreditoService $credito)
    {
        $data = $request->validate(
            ['motivo' => 'required|string|max:500'],
            ['motivo.required' => 'Escribe por qué se bloquea el crédito.'],
        );

        $cliente->update([
            'credito_bloqueado' => true,
            'credito_bloqueo_motivo' => $data['motivo'],
            'credito_bloqueado_por' => $request->user()->id,
            'credito_bloqueado_en' => now(),
        ]);

        return response()->json(['resumen' => $credito->resumen($cliente->fresh())]);
    }

    /** Quita el bloqueo: el estado vuelve a calcularse solo con sus cuotas y su línea. */
    public function desbloquearCredito(Cliente $cliente, CreditoService $credito)
    {
        $cliente->update([
            'credito_bloqueado' => false,
            'credito_bloqueo_motivo' => null,
            'credito_bloqueado_por' => null,
            'credito_bloqueado_en' => null,
        ]);

        return response()->json(['resumen' => $credito->resumen($cliente->fresh())]);
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
}
