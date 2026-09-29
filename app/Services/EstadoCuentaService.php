<?php

namespace App\Services;

use App\Models\Cliente;
use App\Models\CuentaPorCobrar;
use App\Models\CuentaPorCobrarPago;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * El estado de cuenta de un cliente: sus ventas a crédito (cargos), lo que
 * fue pagando (abonos) y el saldo que queda, por moneda —una deuda en soles y
 * otra en dólares no se suman—, más las cuotas que le faltan pagar.
 *
 * Lo usan la pantalla, el Excel y el PDF: los tres muestran lo mismo.
 */
class EstadoCuentaService
{
    /** Cuántos días antes del vencimiento una cuota ya se avisa "por vencer". */
    public const DIAS_AVISO = 3;

    private const FORMAS = ['efectivo' => 'Efectivo', 'transferencia' => 'Transferencia', 'billetera' => 'Billetera'];

    public function __construct(protected CreditoService $credito) {}

    public function armar(Cliente $cliente, ?string $desde = null, ?string $hasta = null): array
    {
        $hasta = $hasta ? Carbon::parse($hasta)->toDateString() : today()->toDateString();
        $desde = $desde ? Carbon::parse($desde)->toDateString() : Carbon::parse($hasta)->subDays(90)->toDateString();

        $cliente->loadMissing('lineaCredito');
        $diasGracia = (int) ($cliente->lineaCredito?->dias_gracia ?? 0);

        $cuentas = CuentaPorCobrar::with(['notaVenta:id,serie,numero,fecha_emision', 'pagos'])
            ->where('cliente_id', $cliente->id)
            ->get();

        $movimientos = $this->movimientos($cuentas);

        $monedas = $movimientos->groupBy('moneda')->map(function (Collection $lista, string $moneda) use ($desde, $hasta) {
            $antes = $lista->filter(fn ($m) => $m['fecha'] < $desde);
            $saldo = round($antes->sum('cargo') - $antes->sum('abono'), 2);
            $inicial = $saldo;

            $filas = $lista->filter(fn ($m) => $m['fecha'] >= $desde && $m['fecha'] <= $hasta)
                ->values()
                ->map(function ($m) use (&$saldo) {
                    $saldo = round($saldo + $m['cargo'] - $m['abono'], 2);

                    return $m + ['saldo' => $saldo];
                });

            return [
                'moneda' => $moneda,
                'saldo_inicial' => $inicial,
                'cargos' => round($filas->sum('cargo'), 2),
                'abonos' => round($filas->sum('abono'), 2),
                'saldo_final' => $saldo,
                'movimientos' => $filas->all(),
            ];
        })->sortKeys()->values()->all();

        return [
            'cliente' => $cliente->only(['id', 'codigo', 'nombre', 'tipo_documento', 'numero_documento', 'direccion', 'telefono']),
            'desde' => $desde,
            'hasta' => $hasta,
            'resumen' => $this->credito->resumen($cliente),
            'monedas' => $monedas,
            'cuotas' => $this->cuotasPendientes($cuentas, $diasGracia),
        ];
    }

    /**
     * Cada venta a crédito es un cargo (todas sus cuotas juntas) y cada pago
     * un abono, en orden de fecha; a igual fecha, primero el cargo.
     */
    private function movimientos(Collection $cuentas): Collection
    {
        $cargos = $cuentas->groupBy('nota_venta_id')->map(function (Collection $cuotas) {
            $nota = $cuotas->first()->notaVenta;
            $n = $cuotas->count();

            return [
                'fecha' => $nota?->fecha_emision?->toDateString() ?? $cuotas->first()->created_at->toDateString(),
                'tipo' => 'venta',
                'documento' => $this->documento($nota),
                'detalle' => $n > 1 ? "Venta al crédito en {$n} cuotas" : 'Venta al crédito',
                'moneda' => $cuotas->first()->moneda ?: 'PEN',
                'cargo' => round($cuotas->sum(fn ($c) => (float) $c->monto_total), 2),
                'abono' => 0.0,
            ];
        });

        $abonos = $cuentas->flatMap(fn (CuentaPorCobrar $c) => $c->pagos->map(fn (CuentaPorCobrarPago $p) => [
            'fecha' => $p->fecha->toDateString(),
            'tipo' => 'pago',
            'documento' => $this->documento($c->notaVenta),
            'detalle' => $this->detallePago($c, $p),
            'moneda' => $c->moneda ?: 'PEN',
            'cargo' => 0.0,
            'abono' => round((float) $p->monto, 2),
        ]));

        return $cargos->values()->concat($abonos)
            ->sortBy(fn ($m) => $m['fecha'].($m['tipo'] === 'venta' ? '0' : '1'))
            ->values();
    }

    private function detallePago(CuentaPorCobrar $cuenta, CuentaPorCobrarPago $pago): string
    {
        $texto = 'Pago'.((int) $cuenta->total_cuotas > 1 ? " cuota {$cuenta->numero_cuota}/{$cuenta->total_cuotas}" : '')
            .' · '.(self::FORMAS[$pago->forma_pago] ?? ucfirst((string) $pago->forma_pago));

        // Pagado con soles una deuda en dólares: cuánto y a qué tipo de cambio.
        if ($pago->monto_pen !== null) {
            $texto .= ' · S/ '.number_format((float) $pago->monto_pen, 2).' a T.C. '.rtrim(rtrim(number_format((float) $pago->tipo_cambio, 4), '0'), '.');
        }

        return $texto;
    }

    /**
     * Las cuotas que le faltan pagar, de la que vence primero a la última, con
     * cuántos días faltan (o pasaron) y en qué quedó: por vencer, vence hoy,
     * en gracia o vencida.
     */
    private function cuotasPendientes(Collection $cuentas, int $diasGracia): array
    {
        $hoy = today();

        return $cuentas->whereIn('estado', ['pendiente', 'parcial'])
            ->sortBy(fn ($c) => $c->fecha_vencimiento->toDateString())
            ->values()
            ->map(function (CuentaPorCobrar $c) use ($hoy, $diasGracia) {
                $vence = $c->fecha_vencimiento;
                $dias = (int) $hoy->diffInDays($vence, false); // + faltan, - pasaron

                return [
                    'id' => $c->id,
                    'documento' => $this->documento($c->notaVenta),
                    'cuota' => "{$c->numero_cuota}/{$c->total_cuotas}",
                    'vence' => $vence->toDateString(),
                    'dias' => $dias,
                    'situacion' => self::situacion($dias, $diasGracia),
                    'moneda' => $c->moneda ?: 'PEN',
                    'monto' => round((float) $c->monto_total, 2),
                    'pagado' => round((float) $c->monto_pagado, 2),
                    'saldo' => round((float) $c->saldo, 2),
                ];
            })
            ->all();
    }

    /** vencida | en_gracia | vence_hoy | por_vencer (dentro del aviso) | al_dia */
    public static function situacion(int $diasParaVencer, int $diasGracia): string
    {
        return match (true) {
            $diasParaVencer < -$diasGracia => 'vencida',
            $diasParaVencer < 0 => 'en_gracia',
            $diasParaVencer === 0 => 'vence_hoy',
            $diasParaVencer <= self::DIAS_AVISO => 'por_vencer',
            default => 'al_dia',
        };
    }

    private function documento($nota): string
    {
        return $nota ? "{$nota->serie}-{$nota->numero}" : '—';
    }
}
