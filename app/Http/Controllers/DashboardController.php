<?php

namespace App\Http\Controllers;

use App\Models\CuentaPorCobrar;
use App\Models\CuentaPorPagar;
use App\Models\MovimientoCaja;
use App\Models\NotaVenta;
use App\Models\ProductoAlmacenStock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Dashboard inteligente del escritorio: KPIs, series para gráficos e insights.
 * Solo soles, sin IGV. Todas las ventas consideradas son notas de venta emitidas.
 */
class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $dias = (int) $request->input('dias', 30);
        $dias = in_array($dias, [7, 30, 90, 365]) ? $dias : 30;
        $hasta = now()->endOfDay();
        $desde = now()->subDays($dias - 1)->startOfDay();
        $rango = [$desde->toDateString(), $hasta->toDateString()];

        // ---- Base de ventas emitidas en el rango ----
        $ventas = NotaVenta::where('estado', 'emitida')->whereBetween('fecha_emision', $rango);

        $ventasTotal = (float) (clone $ventas)->sum('total');
        $numVentas = (int) (clone $ventas)->count();
        $ticket = $numVentas > 0 ? round($ventasTotal / $numVentas, 2) : 0;

        // ---- Serie: ventas por día ----
        $ventasPorDia = (clone $ventas)
            ->selectRaw('DATE(fecha_emision) as fecha, SUM(total) as total')
            ->groupBy('fecha')->orderBy('fecha')->get()
            ->map(fn ($r) => ['fecha' => $r->fecha, 'total' => round((float) $r->total, 2)]);

        // ---- Contado vs Crédito ----
        $pagoTipo = (clone $ventas)
            ->selectRaw('tipo_pago, SUM(total) as total')
            ->groupBy('tipo_pago')->get()
            ->map(fn ($r) => ['tipo' => $r->tipo_pago, 'total' => round((float) $r->total, 2)]);

        // ---- Agregado por producto (unidades, total, ganancia) ----
        // Costo por presentación = costo_promedio (unidad base) * factor_conversion.
        $porProducto = DB::table('nota_venta_detalles as d')
            ->join('notas_venta as nv', 'nv.id', '=', 'd.nota_venta_id')
            ->join('producto_presentaciones as pp', 'pp.id', '=', 'd.producto_presentacion_id')
            ->join('productos as p', 'p.id', '=', 'pp.producto_id')
            ->leftJoin(DB::raw('(SELECT producto_id, AVG(NULLIF(costo_promedio,0)) AS costo FROM producto_almacen_stock GROUP BY producto_id) as c'), 'c.producto_id', '=', 'p.id')
            ->where('nv.estado', 'emitida')
            ->whereBetween('nv.fecha_emision', $rango)
            ->groupBy('p.id', 'p.nombre')
            ->selectRaw('p.id, p.nombre,
                SUM(d.cantidad) as unidades,
                SUM(d.subtotal) as total,
                SUM((d.precio_unitario - (pp.factor_conversion * COALESCE(c.costo,0))) * d.cantidad) as ganancia')
            ->get()
            ->map(fn ($r) => [
                'id' => (int) $r->id,
                'producto' => $r->nombre,
                'unidades' => round((float) $r->unidades, 2),
                'total' => round((float) $r->total, 2),
                'ganancia' => round((float) $r->ganancia, 2),
            ]);

        $margenEstimado = round($porProducto->sum('ganancia'), 2);

        $topVendidos = $porProducto->sortByDesc('unidades')->take(10)->values();
        $topGanancia = $porProducto->sortByDesc('ganancia')->take(10)->values();

        // ---- Ventas por categoría ----
        $ventasCategoria = DB::table('nota_venta_detalles as d')
            ->join('notas_venta as nv', 'nv.id', '=', 'd.nota_venta_id')
            ->join('producto_presentaciones as pp', 'pp.id', '=', 'd.producto_presentacion_id')
            ->join('productos as p', 'p.id', '=', 'pp.producto_id')
            ->leftJoin('categorias as cat', 'cat.id', '=', 'p.categoria_id')
            ->where('nv.estado', 'emitida')
            ->whereBetween('nv.fecha_emision', $rango)
            ->groupBy('cat.id', 'cat.nombre')
            ->selectRaw("COALESCE(cat.nombre, 'Sin categoría') as categoria, SUM(d.subtotal) as total")
            ->orderByDesc('total')->get()
            ->map(fn ($r) => ['categoria' => $r->categoria, 'total' => round((float) $r->total, 2)]);

        // ---- Caja: ingresos vs egresos en el rango ----
        $caja = MovimientoCaja::whereBetween('fecha', $rango)
            ->selectRaw('tipo, SUM(monto) as total')
            ->groupBy('tipo')->get()
            ->map(fn ($r) => ['tipo' => $r->tipo, 'total' => round((float) $r->total, 2)]);

        // ---- Snapshot de stock / deudas ----
        $porCobrar = round((float) CuentaPorCobrar::whereIn('estado', ['pendiente', 'parcial'])->sum('saldo'), 2);
        $porPagar = round((float) CuentaPorPagar::whereIn('estado', ['pendiente', 'parcial'])->sum('saldo'), 2);
        $capitalInmovilizado = round((float) ProductoAlmacenStock::selectRaw('SUM(stock_actual * costo_promedio) as v')->value('v'), 2);

        // Stock actual agregado por producto (sumando almacenes)
        $stockPorProducto = DB::table('producto_almacen_stock as s')
            ->join('productos as p', 'p.id', '=', 's.producto_id')
            ->groupBy('p.id', 'p.nombre')
            ->selectRaw('p.id, p.nombre, SUM(s.stock_actual) as stock, MAX(s.stock_minimo) as minimo')
            ->get();

        $bajoStock = $stockPorProducto
            ->filter(fn ($r) => (float) $r->stock <= 0 || ((float) $r->minimo > 0 && (float) $r->stock <= (float) $r->minimo))
            ->sortBy('stock')
            ->take(10)
            ->map(fn ($r) => [
                'producto' => $r->nombre,
                'stock' => round((float) $r->stock, 2),
                'minimo' => round((float) $r->minimo, 2),
            ])->values();

        $productosAlerta = $stockPorProducto
            ->filter(fn ($r) => (float) $r->stock <= 0 || ((float) $r->minimo > 0 && (float) $r->stock <= (float) $r->minimo))
            ->count();

        // ---- Insights inteligentes ----
        $stockMap = $stockPorProducto->keyBy('id');
        $vendidosIds = $porProducto->pluck('id')->all();

        // Producto estrella: mayor ganancia del periodo.
        $estrella = $porProducto->sortByDesc('ganancia')->first();

        // Vende mucho pero deja poco margen (menor margen unitario entre los 10 más vendidos).
        $margenBajo = $topVendidos
            ->filter(fn ($r) => $r['unidades'] > 0)
            ->map(fn ($r) => array_merge($r, ['margen_unitario' => round($r['ganancia'] / $r['unidades'], 2)]))
            ->sortBy('margen_unitario')->take(3)->values();

        // Reposición urgente: de los más vendidos, los que están en o bajo el stock mínimo.
        $reposicion = $porProducto->sortByDesc('unidades')->take(20)
            ->map(function ($r) use ($stockMap) {
                $s = $stockMap->get($r['id']);
                return array_merge($r, [
                    'stock' => $s ? round((float) $s->stock, 2) : 0,
                    'minimo' => $s ? round((float) $s->minimo, 2) : 0,
                ]);
            })
            ->filter(fn ($r) => $r['stock'] <= 0 || ($r['minimo'] > 0 && $r['stock'] <= $r['minimo']))
            ->take(5)->values();

        // Sin rotación: con stock disponible pero sin ventas en el periodo.
        $sinRotacion = $stockPorProducto
            ->filter(fn ($r) => (float) $r->stock > 0 && ! in_array((int) $r->id, $vendidosIds, true))
            ->sortByDesc('stock')->take(8)
            ->map(fn ($r) => ['producto' => $r->nombre, 'stock' => round((float) $r->stock, 2)])
            ->values();

        return response()->json([
            'rango' => ['desde' => $rango[0], 'hasta' => $rango[1], 'dias' => $dias],
            'kpis' => [
                'ventas_total' => round($ventasTotal, 2),
                'num_ventas' => $numVentas,
                'ticket_promedio' => $ticket,
                'margen_estimado' => $margenEstimado,
                'por_cobrar' => $porCobrar,
                'por_pagar' => $porPagar,
                'productos_alerta' => $productosAlerta,
                'capital_inmovilizado' => $capitalInmovilizado,
            ],
            'ventas_por_dia' => $ventasPorDia,
            'top_vendidos' => $topVendidos,
            'top_ganancia' => $topGanancia,
            'ventas_por_categoria' => $ventasCategoria,
            'pago_tipo' => $pagoTipo,
            'caja' => $caja,
            'bajo_stock' => $bajoStock,
            'insights' => [
                'producto_estrella' => $estrella,
                'margen_bajo' => $margenBajo,
                'reposicion_urgente' => $reposicion,
                'sin_rotacion' => $sinRotacion,
            ],
        ]);
    }
}
