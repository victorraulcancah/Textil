<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Reportes financieros (solo soles, sin IGV).
 *
 * Todas las ventas consideradas son notas de venta emitidas. El costo de cada
 * línea es el costo promedio del producto convertido a la presentación vendida
 * (factor_conversion).
 *
 *  - Ganancia  = ventas − costo               (lo que se gana en la venta).
 *  - Utilidad  = ganancia − gastos operativos (lo que realmente queda).
 */
class ReporteController extends Controller
{
    private const COSTO_SUB = '(SELECT producto_id, AVG(NULLIF(costo_promedio,0)) AS costo FROM producto_almacen_stock GROUP BY producto_id)';

    private const AGG = 'SUM(d.subtotal) as ventas,
        SUM(d.cantidad * pp.factor_conversion * COALESCE(c.costo,0)) as costo,
        SUM(d.cantidad) as unidades,
        COUNT(DISTINCT nv.id) as num_ventas';

    /** Hasta cuántos días se agrupa por día automáticamente; rangos más largos van por mes. */
    private const MAX_DIAS_DIARIO = 92;

    /* ------------------------------------------------------------------ */
    /*  Endpoints                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * Estado de resultados: ventas − costo − gastos.
     * agrupar: auto | dia | mes | producto | categoria.
     */
    public function utilidades(Request $request)
    {
        [$desde, $hasta] = $this->rango($request, now()->startOfMonth());
        $agrupar = $this->agruparTiempo($request, ['dia', 'mes', 'producto', 'categoria'], $desde, $hasta);

        if (in_array($agrupar, ['dia', 'mes'], true)) {
            $filas = $this->serieTemporal($agrupar, $desde, $hasta, true);
        } else {
            $q = $this->ventasBase($desde, $hasta);
            if ($agrupar === 'producto') {
                $q->selectRaw('p.nombre as grupo, ' . self::AGG)->groupBy('p.id', 'p.nombre');
            } else {
                $q->leftJoin('categorias as cat', 'cat.id', '=', 'p.categoria_id')
                    ->selectRaw("COALESCE(cat.nombre, 'Sin categoría') as grupo, " . self::AGG)
                    ->groupBy('cat.id', 'cat.nombre');
            }
            $filas = $q->get()
                ->map(fn ($r) => $this->fila($r->grupo, $r, 0.0))
                ->sortByDesc('ganancia')
                ->values();
        }

        $tot = $this->resumen($desde, $hasta);
        $filas = $this->conParticipacion($filas);

        return response()->json([
            'agrupar' => $agrupar,
            'rango' => ['desde' => $desde->toDateString(), 'hasta' => $hasta->toDateString()],
            'filas' => $filas,
            'totales' => $tot,
            'anterior' => $this->periodoAnterior($desde, $hasta),
        ]);
    }

    /**
     * Ganancias (ventas − costo, sin gastos) por producto, categoría, venta,
     * cliente o vendedor, más la tendencia del periodo.
     * agrupar: producto | categoria | venta | cliente | vendedor.
     */
    public function ganancias(Request $request)
    {
        [$desde, $hasta] = $this->rango($request, now()->startOfMonth());
        $validos = ['producto', 'categoria', 'venta', 'cliente', 'vendedor'];
        $agrupar = in_array($request->input('agrupar'), $validos, true) ? $request->input('agrupar') : 'producto';

        $q = $this->ventasBase($desde, $hasta);
        switch ($agrupar) {
            case 'categoria':
                $q->leftJoin('categorias as cat', 'cat.id', '=', 'p.categoria_id')
                    ->selectRaw("cat.id as id, COALESCE(cat.nombre, 'Sin categoría') as grupo, NULL as detalle, NULL as fecha, " . self::AGG)
                    ->groupBy('cat.id', 'cat.nombre');
                break;
            case 'venta':
                $q->leftJoin('clientes as cl', 'cl.id', '=', 'nv.cliente_id')
                    ->selectRaw("nv.id as id, COALESCE(CONCAT(nv.serie, '-', nv.numero), CONCAT('#', nv.id)) as grupo, COALESCE(cl.nombre, 'Público general') as detalle, nv.fecha_emision as fecha, " . self::AGG)
                    ->groupBy('nv.id', 'nv.serie', 'nv.numero', 'cl.nombre', 'nv.fecha_emision');
                break;
            case 'cliente':
                $q->leftJoin('clientes as cl', 'cl.id', '=', 'nv.cliente_id')
                    ->selectRaw("cl.id as id, COALESCE(cl.nombre, 'Público general') as grupo, cl.numero_documento as detalle, NULL as fecha, " . self::AGG)
                    ->groupBy('cl.id', 'cl.nombre', 'cl.numero_documento');
                break;
            case 'vendedor':
                $q->join('users as u', 'u.id', '=', 'nv.vendedor_id')
                    ->selectRaw('u.id as id, u.name as grupo, u.email as detalle, NULL as fecha, ' . self::AGG)
                    ->groupBy('u.id', 'u.name', 'u.email');
                break;
            default: // producto
                $q->leftJoin('categorias as cat', 'cat.id', '=', 'p.categoria_id')
                    ->selectRaw("p.id as id, p.nombre as grupo, COALESCE(cat.nombre, 'Sin categoría') as detalle, NULL as fecha, " . self::AGG)
                    ->groupBy('p.id', 'p.nombre', 'cat.nombre');
        }

        $tot = $this->resumen($desde, $hasta);

        $filas = $q->get()
            ->map(function ($r) {
                $f = $this->fila($r->grupo, $r, 0.0);
                $f['id'] = $r->id !== null ? (int) $r->id : null;
                $f['detalle'] = $r->detalle;
                $f['fecha'] = $r->fecha;

                return $f;
            })
            ->sortByDesc('ganancia')
            ->values();
        $filas = $this->conParticipacion($filas);

        $serieEn = $this->diasEnRango($desde, $hasta) <= self::MAX_DIAS_DIARIO ? 'dia' : 'mes';

        return response()->json([
            'agrupar' => $agrupar,
            'rango' => ['desde' => $desde->toDateString(), 'hasta' => $hasta->toDateString()],
            'serie_por' => $serieEn,
            'serie' => $this->serieTemporal($serieEn, $desde, $hasta, false),
            'filas' => $filas,
            'totales' => $tot,
            'anterior' => $this->periodoAnterior($desde, $hasta),
        ]);
    }

    /* ------------------------------------------------------------------ */
    /*  Helpers de rango / agrupación                                      */
    /* ------------------------------------------------------------------ */

    /** [desde, hasta] del request (startOfDay / endOfDay), con defaults. */
    private function rango(Request $request, Carbon $defaultDesde): array
    {
        $request->validate(['desde' => 'nullable|date', 'hasta' => 'nullable|date']);

        $desde = ($request->date('desde') ?? $defaultDesde)->copy()->startOfDay();
        $hasta = ($request->date('hasta') ?? now())->copy()->endOfDay();
        if ($hasta->lt($desde)) {
            [$desde, $hasta] = [$hasta->copy()->startOfDay(), $desde->copy()->endOfDay()];
        }

        return [$desde, $hasta];
    }

    private function diasEnRango(Carbon $desde, Carbon $hasta): int
    {
        return (int) $desde->copy()->startOfDay()->diffInDays($hasta->copy()->startOfDay()) + 1;
    }

    /** Agrupación pedida o, si es "auto"/inválida, día para rangos cortos y mes para largos. */
    private function agruparTiempo(Request $request, array $validos, Carbon $desde, Carbon $hasta): string
    {
        $a = $request->input('agrupar');
        if (in_array($a, $validos, true)) {
            return $a;
        }

        return $this->diasEnRango($desde, $hasta) <= self::MAX_DIAS_DIARIO ? 'dia' : 'mes';
    }

    /** Lista completa de periodos (Y-m-d o Y-m) entre desde y hasta, para rellenar con ceros. */
    private function periodos(string $agrupar, Carbon $desde, Carbon $hasta): array
    {
        if ($agrupar === 'dia') {
            return collect(CarbonPeriod::create($desde->toDateString(), $hasta->toDateString()))
                ->map(fn ($d) => $d->format('Y-m-d'))
                ->all();
        }

        $out = [];
        for ($m = $desde->copy()->startOfMonth(); $m->lte($hasta); $m->addMonth()) {
            $out[] = $m->format('Y-m');
        }

        return $out;
    }

    /* ------------------------------------------------------------------ */
    /*  Consultas                                                          */
    /* ------------------------------------------------------------------ */

    /** Detalles de ventas emitidas en el rango, con el costo promedio del producto. */
    private function ventasBase(Carbon $desde, Carbon $hasta)
    {
        return DB::table('nota_venta_detalles as d')
            ->join('notas_venta as nv', 'nv.id', '=', 'd.nota_venta_id')
            ->join('producto_presentaciones as pp', 'pp.id', '=', 'd.producto_presentacion_id')
            ->join('productos as p', 'p.id', '=', 'pp.producto_id')
            ->leftJoin(DB::raw('(' . self::COSTO_SUB . ') as c'), 'c.producto_id', '=', 'p.id')
            ->where('nv.estado', 'emitida')
            ->whereBetween('nv.fecha_emision', [$desde->toDateString(), $hasta->toDateString()]);
    }

    /** Egresos de caja marcados como gasto operativo dentro del rango. */
    private function gastosQuery(Carbon $desde, Carbon $hasta)
    {
        return DB::table('movimientos_caja as m')
            ->join('motivos_movimiento as mo', 'mo.id', '=', 'm.motivo_movimiento_id')
            ->where('m.tipo', 'egreso')
            ->where('mo.categoria_gasto', 'operativo')
            ->whereBetween('m.fecha', [$desde->toDateString(), $hasta->toDateString()]);
    }

    private function gastosTotal(Carbon $desde, Carbon $hasta): float
    {
        return round((float) $this->gastosQuery($desde, $hasta)->sum('m.monto'), 2);
    }

    /**
     * Serie por día o por mes con todos los periodos del rango (los que no
     * tuvieron ventas van en cero para que el gráfico sea continuo).
     */
    private function serieTemporal(string $agrupar, Carbon $desde, Carbon $hasta, bool $conGastos): Collection
    {
        $fmt = $agrupar === 'dia' ? '%Y-%m-%d' : '%Y-%m';

        $ventas = $this->ventasBase($desde, $hasta)
            ->selectRaw("DATE_FORMAT(nv.fecha_emision, '$fmt') as grupo, " . self::AGG)
            ->groupBy('grupo')
            ->get()
            ->keyBy('grupo');

        $gastos = $conGastos
            ? $this->gastosQuery($desde, $hasta)
                ->selectRaw("DATE_FORMAT(m.fecha, '$fmt') as grupo, SUM(m.monto) as gastos")
                ->groupBy('grupo')
                ->pluck('gastos', 'grupo')
            : collect();

        return collect($this->periodos($agrupar, $desde, $hasta))
            ->map(fn ($g) => $this->fila($g, $ventas->get($g), (float) ($gastos[$g] ?? 0)))
            ->values();
    }

    /* ------------------------------------------------------------------ */
    /*  Cálculo                                                            */
    /* ------------------------------------------------------------------ */

    /** Fila normalizada a partir de un registro agregado (null = sin ventas en el periodo). */
    private function fila(?string $grupo, ?object $r, float $gastos): array
    {
        $ventas = round((float) ($r->ventas ?? 0), 2);
        $costo = round((float) ($r->costo ?? 0), 2);
        $ganancia = round($ventas - $costo, 2);
        $gastos = round($gastos, 2);
        $neta = round($ganancia - $gastos, 2);

        return [
            'grupo' => (string) $grupo,
            'ventas' => $ventas,
            'costo' => $costo,
            // Ganancia = lo que se gana en la venta (ventas − costo), antes de gastos.
            'ganancia' => $ganancia,
            'utilidad_bruta' => $ganancia,
            'gastos' => $gastos,
            // Utilidad = ganancia − gastos operativos (lo que realmente queda).
            'utilidad_neta' => $neta,
            'unidades' => round((float) ($r->unidades ?? 0), 2),
            'num_ventas' => (int) ($r->num_ventas ?? 0),
            // % de ganancia (marcado sobre el costo), margen bruto y neto (sobre ventas).
            'margen_ganancia' => $costo > 0 ? round($ganancia / $costo * 100, 1) : 0,
            'margen_bruto' => $ventas > 0 ? round($ganancia / $ventas * 100, 1) : 0,
            'margen' => $ventas > 0 ? round($neta / $ventas * 100, 1) : 0,
        ];
    }

    /** Totales del rango en una sola consulta agregada (+ gastos operativos). */
    private function resumen(Carbon $desde, Carbon $hasta): array
    {
        $r = $this->ventasBase($desde, $hasta)->selectRaw(self::AGG)->first();
        $t = $this->fila('total', $r, $this->gastosTotal($desde, $hasta));
        unset($t['grupo']);
        $t['ticket_promedio'] = $t['num_ventas'] > 0 ? round($t['ventas'] / $t['num_ventas'], 2) : 0;

        return $t;
    }

    /** Mismos totales para el periodo inmediatamente anterior, de igual duración. */
    private function periodoAnterior(Carbon $desde, Carbon $hasta): array
    {
        $dias = $this->diasEnRango($desde, $hasta);
        $pHasta = $desde->copy()->subDay()->endOfDay();
        $pDesde = $pHasta->copy()->subDays($dias - 1)->startOfDay();

        return array_merge(
            ['rango' => ['desde' => $pDesde->toDateString(), 'hasta' => $pHasta->toDateString()]],
            $this->resumen($pDesde, $pHasta),
        );
    }

    /**
     * Agrega a cada fila su participación (%) en la ganancia generada. Se usa la
     * suma de las ganancias positivas como base: así el reparto sigue teniendo
     * sentido aunque alguna fila pierda dinero (esas van en 0%).
     */
    private function conParticipacion(Collection $filas): Collection
    {
        $base = (float) $filas->where('ganancia', '>', 0)->sum('ganancia');

        return $filas->map(function ($f) use ($base) {
            $f['participacion'] = $base > 0 && $f['ganancia'] > 0 ? round($f['ganancia'] / $base * 100, 1) : 0;

            return $f;
        })->values();
    }
}
