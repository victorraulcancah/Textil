<?php

namespace App\Services;

use App\Models\Cliente;
use App\Models\CuentaPorCobrar;
use App\Models\NotaVenta;
use App\Models\OrdenVenta;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/** Lo que el cliente ha comprado: sus documentos emitidos y su estadística de ventas. Solo lectura. */
class ClienteHistorialService
{
    public function __construct(private readonly CreditoService $credito) {}

    /**
     * Los documentos emitidos al cliente: sus proformas —con lo que falta cobrar de cada una— y sus pedidos, de lo más
     * reciente a lo más antiguo. Sin fechas, todo.
     *
     * @return array{notas_venta: \Illuminate\Support\Collection, pedidos: \Illuminate\Support\Collection}
     */
    public function documentos(Cliente $cliente, ?string $desde = null, ?string $hasta = null): array
    {
        $enRango = fn ($q) => $q
            ->when($desde, fn ($q, $d) => $q->whereDate('fecha_emision', '>=', $d))
            ->when($hasta, fn ($q, $h) => $q->whereDate('fecha_emision', '<=', $h));

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

        return ['notas_venta' => $notas, 'pedidos' => $pedidos];
    }

    /**
     * Lo que compra el cliente en los últimos meses: cuánto y cuántas veces, mes por mes, y los productos que más lleva;
     * más lo de siempre (desde cuándo compra, su última compra). Todo en soles: lo vendido en dólares se lleva a soles
     * con el tipo de cambio de su día. Solo ventas emitidas.
     */
    public function estadistica(Cliente $cliente, int $meses = 12): array
    {
        $desde = now()->startOfMonth()->subMonths($meses - 1);

        $enSoles = "CASE WHEN nv.moneda = 'USD' THEN nv.total * COALESCE(nv.tipo_cambio, 1) ELSE nv.total END";

        $ventas = DB::table('notas_venta as nv')
            ->where('nv.cliente_id', $cliente->id)
            ->where('nv.estado', 'emitida');

        $siempre = (clone $ventas)->selectRaw("COUNT(*) AS compras, SUM({$enSoles}) AS total,
            MIN(nv.fecha_emision) AS primera, MAX(nv.fecha_emision) AS ultima")->first();

        $enPeriodo = (clone $ventas)->where('nv.fecha_emision', '>=', $desde->toDateString());
        $periodo = (clone $enPeriodo)->selectRaw("COUNT(*) AS compras, SUM({$enSoles}) AS total,
            SUM(CASE WHEN nv.tipo_pago = 'credito' THEN {$enSoles} ELSE 0 END) AS a_credito")->first();

        $comprasPeriodo = (int) ($periodo->compras ?? 0);
        $totalPeriodo = round((float) ($periodo->total ?? 0), 2);

        return [
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
            'por_mes' => $this->comprasPorMes($enPeriodo, $enSoles, $desde),
            'productos' => $this->productosMasComprados($cliente, $desde),
            'credito' => $this->credito->resumen($cliente),
        ];
    }

    /** Todos los meses del periodo, aunque en alguno no haya comprado. */
    private function comprasPorMes($enPeriodo, string $enSoles, Carbon $desde): array
    {
        $porMes = (clone $enPeriodo)
            ->selectRaw("DATE_FORMAT(nv.fecha_emision, '%Y-%m') AS mes, COUNT(*) AS compras, SUM({$enSoles}) AS total")
            ->groupBy('mes')
            ->get()
            ->keyBy('mes');

        $serie = [];
        for ($mes = $desde->copy(); $mes->lte(now()); $mes->addMonth()) {
            $clave = $mes->format('Y-m');
            $serie[] = [
                'mes' => $clave,
                'compras' => (int) ($porMes[$clave]->compras ?? 0),
                'total' => round((float) ($porMes[$clave]->total ?? 0), 2),
            ];
        }

        return $serie;
    }

    /** Los 10 productos que más lleva en el periodo, por importe. */
    private function productosMasComprados(Cliente $cliente, Carbon $desde)
    {
        $fx = "(CASE WHEN nv.moneda = 'USD' THEN COALESCE(nv.tipo_cambio, 1) ELSE 1 END)";

        return DB::table('nota_venta_detalles as d')
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
    }
}
