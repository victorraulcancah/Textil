<?php

namespace App\Http\Controllers;

use App\Models\AperturaCaja;
use App\Models\CuentaPorCobrar;
use App\Models\CuentaPorPagar;
use Illuminate\Support\Facades\DB;

/**
 * Alertas del negocio calculadas en vivo (no se persisten): quiebre y bajo stock,
 * cobranzas y pagos vencidos, y cajas abiertas de días anteriores.
 */
class AlertaController extends Controller
{
    public function index()
    {
        $hoy = now()->toDateString();
        $alertas = [];

        // ── Stock: quiebre y bajo stock (agregado por producto) ──
        $stock = DB::table('producto_almacen_stock as s')
            ->join('productos as p', 'p.id', '=', 's.producto_id')
            ->groupBy('p.id', 'p.nombre')
            ->selectRaw('p.nombre, SUM(s.stock_actual) as stock, MAX(s.stock_minimo) as minimo')
            ->get();

        foreach ($stock as $r) {
            $actual = (float) $r->stock;
            $minimo = (float) $r->minimo;
            if ($actual <= 0) {
                $alertas[] = [
                    'nivel' => 'danger',
                    'tipo' => 'quiebre',
                    'titulo' => "Sin stock: {$r->nombre}",
                    'detalle' => 'Producto agotado, requiere reposición.',
                ];
            } elseif ($minimo > 0 && $actual <= $minimo) {
                $alertas[] = [
                    'nivel' => 'warning',
                    'tipo' => 'bajo_stock',
                    'titulo' => "Bajo stock: {$r->nombre}",
                    'detalle' => 'Quedan '.$this->n($actual).' (mínimo '.$this->n($minimo).').',
                ];
            }
        }

        // ── Cuentas por cobrar vencidas ──
        CuentaPorCobrar::with('cliente:id,nombre')
            ->whereIn('estado', ['pendiente', 'parcial'])
            ->whereDate('fecha_vencimiento', '<', $hoy)
            ->get()
            ->each(function ($c) use (&$alertas) {
                $alertas[] = [
                    'nivel' => 'warning',
                    'tipo' => 'cxc_vencida',
                    'titulo' => 'Cobranza vencida: '.($c->cliente->nombre ?? 'Cliente'),
                    'detalle' => 'Saldo S/ '.$this->n($c->saldo).' · venció el '.$c->fecha_vencimiento?->format('d/m/Y'),
                ];
            });

        // ── Cuentas por pagar vencidas ──
        CuentaPorPagar::with('proveedor:id,nombre')
            ->whereIn('estado', ['pendiente', 'parcial'])
            ->whereDate('fecha_vencimiento', '<', $hoy)
            ->get()
            ->each(function ($c) use (&$alertas) {
                $alertas[] = [
                    'nivel' => 'warning',
                    'tipo' => 'cxp_vencida',
                    'titulo' => 'Pago vencido a: '.($c->proveedor->nombre ?? 'Proveedor'),
                    'detalle' => 'Saldo S/ '.$this->n($c->saldo).' · venció el '.$c->fecha_vencimiento?->format('d/m/Y'),
                ];
            });

        // ── Cajas abiertas de días anteriores (sin cerrar) ──
        AperturaCaja::with('caja:id,nombre')
            ->where('estado', 'abierta')
            ->whereDate('fecha_apertura', '<', $hoy)
            ->get()
            ->each(function ($a) use (&$alertas) {
                $alertas[] = [
                    'nivel' => 'info',
                    'tipo' => 'caja_abierta',
                    'titulo' => 'Caja sin cerrar: '.($a->caja->nombre ?? ''),
                    'detalle' => 'Abierta desde el '.$a->fecha_apertura?->format('d/m/Y').'. Considera cerrarla.',
                ];
            });

        // Orden por severidad
        $orden = ['danger' => 0, 'warning' => 1, 'info' => 2];
        usort($alertas, fn ($a, $b) => $orden[$a['nivel']] <=> $orden[$b['nivel']]);
        foreach ($alertas as $i => &$al) {
            $al['id'] = $i + 1;
        }

        return response()->json([
            'total' => count($alertas),
            'por_nivel' => [
                'danger' => collect($alertas)->where('nivel', 'danger')->count(),
                'warning' => collect($alertas)->where('nivel', 'warning')->count(),
                'info' => collect($alertas)->where('nivel', 'info')->count(),
            ],
            'alertas' => $alertas,
        ]);
    }

    /** Formatea un número quitando decimales sobrantes (10.00 → 10, 2.50 → 2.5). */
    private function n($v): string
    {
        $f = (float) $v;
        return rtrim(rtrim(number_format($f, 2, '.', ''), '0'), '.');
    }
}
