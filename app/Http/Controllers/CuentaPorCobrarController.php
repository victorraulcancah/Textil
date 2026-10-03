<?php

namespace App\Http\Controllers;

use App\Models\AperturaCaja;
use App\Models\CuentaPorCobrar;
use App\Models\CuentaPorCobrarPago;
use App\Models\MovimientoCaja;
use App\Services\TipoCambioService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CuentaPorCobrarController extends Controller
{
    /** Tipos de método admitidos. */
    private const FORMAS = 'efectivo,transferencia,billetera';

    public function index()
    {
        return response()->json(
            CuentaPorCobrar::with([
                'cliente:id,nombre', 'notaVenta:id,serie,numero,fecha_emision', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre',
                // Las letras vigentes que se emitieron desde la cuenta: la relación se ve en la lista.
                'letras' => fn ($q) => $q->where('estado', 'emitida')->select('id', 'numero', 'cuenta_por_cobrar_id', 'importe', 'saldo', 'moneda', 'fecha_vencimiento', 'serie_renovacion')->orderBy('numero'),
            ])
                ->withSum(['letras as en_letras' => fn ($q) => $q->where('estado', 'emitida')], 'saldo')
                ->latest('id')
                ->get()
        );
    }

    public function show(CuentaPorCobrar $cuenta)
    {
        return response()->json($cuenta->cargarEnLetras()->load(['cliente:id,nombre', 'notaVenta:id,serie,numero', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }

    /** Registra uno o varios pagos (mixto) contra la cuenta y genera movimiento de caja. */
    public function registrarPago(Request $request, CuentaPorCobrar $cuenta)
    {
        if ($cuenta->estado === 'anulado' || $cuenta->estado === 'pagado') {
            return response()->json(['message' => 'La cuenta no admite más pagos.'], 422);
        }

        // Cobrar mueve dinero: hace falta tener caja y que esté abierta.
        app(\App\Services\CajaService::class)->exigirApertura();

        $data = $request->validate([
            // El día en que se cobró/pagó de verdad: puede ser uno pasado, nunca futuro.
            'fecha' => 'nullable|date|before_or_equal:'.now()->toDateString(),
            'pagos' => 'required|array|min:1',
            'pagos.*.forma_pago' => 'required|in:'.self::FORMAS,
            'pagos.*.cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'pagos.*.billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'pagos.*.monto' => 'required|numeric|min:0.01',
            'pagos.*.referencia' => 'nullable|string|max:100',
            // Una deuda en dólares que se paga con soles: el monto va en
            // soles y se abona su equivalente a este tipo de cambio.
            'pagos.*.moneda' => 'nullable|in:PEN,USD',
            'pagos.*.tipo_cambio' => 'nullable|numeric|min:0.0001',
        ]);

        $abonos = array_map(fn ($p) => $this->abono($cuenta, $p), $data['pagos']);
        if (in_array(null, $abonos, true)) {
            return response()->json(['message' => 'Para cobrar en soles, pon el tipo de cambio.'], 422);
        }

        $totalNuevo = collect($abonos)->sum('monto');
        if ($totalNuevo > (float) $cuenta->saldo + 0.01) {
            return response()->json(['message' => 'El pago excede el saldo pendiente.'], 422);
        }

        // Lo que pasó a letras de cambio ya no se cobra aquí: se cobra con la letra.
        if ($totalNuevo > $cuenta->saldoCobrable() + 0.01) {
            return response()->json([
                'message' => $cuenta->saldoCobrable() <= 0.01
                    ? 'Esta cuenta pasó a letras de cambio: el cobro se hace con la letra, no aquí.'
                    : 'Parte de esta cuenta está en letras de cambio: aquí solo puedes cobrar '.number_format($cuenta->saldoCobrable(), 2).'.',
            ], 422);
        }

        $fecha = $data['fecha'] ?? now()->toDateString();

        DB::transaction(function () use ($cuenta, $data, $abonos, $fecha) {
            $apertura = $this->aperturaAbierta();
            foreach ($data['pagos'] as $i => $p) {
                $abono = $abonos[$i];
                $ingreso = $this->ingreso($cuenta, $abono);
                $cuentaBancariaId = $p['forma_pago'] === 'transferencia' ? ($p['cuenta_bancaria_id'] ?? null) : null;
                $billeteraId = $p['forma_pago'] === 'billetera' ? ($p['billetera_id'] ?? null) : null;

                $mov = $apertura
                    ? MovimientoCaja::create([
                        'apertura_caja_id' => $apertura->id,
                        'tipo' => 'ingreso',
                        'motivo_movimiento_id' => app(\App\Services\CajaService::class)->motivo('Ingreso por cobranza'),
                        'descripcion' => 'Cobranza'.($cuenta->notaVenta ? " de la venta {$cuenta->notaVenta->serie}-{$cuenta->notaVenta->numero}" : '')
                            .($cuenta->total_cuotas > 1 ? " (cuota {$cuenta->numero_cuota}/{$cuenta->total_cuotas})" : ''),
                        'cuenta_bancaria_id' => $cuentaBancariaId,
                        'billetera_id' => $billeteraId,
                        'monto' => $ingreso['monto'],
                        'moneda' => $ingreso['moneda'],
                        'fecha' => $fecha,
                        'numero_operacion' => $p['referencia'] ?? null,
                        'documento_referencia_tipo' => 'cuenta_por_cobrar',
                        'documento_referencia_id' => $cuenta->id,
                    ])
                    : null;

                $cuenta->pagos()->create([
                    'forma_pago' => $p['forma_pago'],
                    'cuenta_bancaria_id' => $cuentaBancariaId,
                    'billetera_id' => $billeteraId,
                    'monto' => $abono['monto'],
                    'moneda' => $cuenta->moneda ?: 'PEN',
                    'monto_pen' => $abono['monto_pen'],
                    'tipo_cambio' => $abono['tipo_cambio'],
                    'referencia' => $p['referencia'] ?? null,
                    'movimiento_caja_id' => $mov?->id,
                    'fecha' => $fecha,
                ]);

                // Cobrado con soles: ese tipo de cambio queda como el comercial del día.
                if ($abono['monto_pen'] !== null) {
                    app(TipoCambioService::class)->recordarComercial($abono['tipo_cambio'], $fecha);
                }
            }
            $this->recalcular($cuenta);
        });

        return response()->json($cuenta->fresh()->cargarEnLetras()->load(['cliente:id,nombre', 'notaVenta:id,serie,numero', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }

    /** Edita un pago existente y ajusta su movimiento de caja. */
    public function actualizarPago(Request $request, CuentaPorCobrarPago $pago)
    {
        $data = $request->validate([
            'forma_pago' => 'required|in:'.self::FORMAS,
            'cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'monto' => 'required|numeric|min:0.01',
            'referencia' => 'nullable|string|max:100',
            // El día en que se cobró/pagó de verdad: puede ser uno pasado, nunca futuro.
            'fecha' => 'nullable|date|before_or_equal:'.now()->toDateString(),
            'moneda' => 'nullable|in:PEN,USD',
            'tipo_cambio' => 'nullable|numeric|min:0.0001',
        ]);

        $cuenta = $pago->cuentaPorCobrar;
        $abono = $this->abono($cuenta, $data);
        if (! $abono) {
            return response()->json(['message' => 'Para cobrar en soles, pon el tipo de cambio.'], 422);
        }

        $pagadoOtros = (float) $cuenta->pagos()->where('id', '!=', $pago->id)->sum('monto');
        if ($pagadoOtros + $abono['monto'] > (float) $cuenta->monto_total + 0.01) {
            return response()->json(['message' => 'El monto excede el total de la cuenta.'], 422);
        }

        $cuentaBancariaId = $data['forma_pago'] === 'transferencia' ? ($data['cuenta_bancaria_id'] ?? null) : null;
        $billeteraId = $data['forma_pago'] === 'billetera' ? ($data['billetera_id'] ?? null) : null;

        DB::transaction(function () use ($pago, $cuenta, $data, $abono, $cuentaBancariaId, $billeteraId) {
            $ingreso = $this->ingreso($cuenta, $abono);

            $pago->update([
                'forma_pago' => $data['forma_pago'],
                'cuenta_bancaria_id' => $cuentaBancariaId,
                'billetera_id' => $billeteraId,
                'monto' => $abono['monto'],
                'monto_pen' => $abono['monto_pen'],
                'tipo_cambio' => $abono['tipo_cambio'],
                'referencia' => $data['referencia'] ?? null,
                'fecha' => $data['fecha'] ?? $pago->fecha,
            ]);

            if ($pago->movimiento_caja_id) {
                MovimientoCaja::where('id', $pago->movimiento_caja_id)->update([
                    'cuenta_bancaria_id' => $cuentaBancariaId,
                    'billetera_id' => $billeteraId,
                    'monto' => $ingreso['monto'],
                    'moneda' => $ingreso['moneda'],
                    'numero_operacion' => $data['referencia'] ?? null,
                    'fecha' => $data['fecha'] ?? $pago->fecha,
                ]);
            }

            if ($abono['monto_pen'] !== null) {
                app(TipoCambioService::class)->recordarComercial($abono['tipo_cambio'], $data['fecha'] ?? $pago->fecha?->toDateString());
            }

            $this->recalcular($cuenta);
        });

        return response()->json($cuenta->fresh()->cargarEnLetras()->load(['cliente:id,nombre', 'notaVenta:id,serie,numero', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }

    /** Anula (elimina) un pago y revierte su movimiento de caja. */
    public function anularPago(CuentaPorCobrarPago $pago)
    {
        $cuenta = $pago->cuentaPorCobrar;

        DB::transaction(function () use ($pago, $cuenta) {
            if ($pago->movimiento_caja_id) {
                MovimientoCaja::where('id', $pago->movimiento_caja_id)->delete();
            }
            $pago->delete();
            $this->recalcular($cuenta);
        });

        return response()->json($cuenta->fresh()->cargarEnLetras()->load(['cliente:id,nombre', 'notaVenta:id,serie,numero', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }

    private function aperturaAbierta(): ?AperturaCaja
    {
        return app(\App\Services\CajaService::class)->aperturaPara();
    }

    /**
     * Lo que un pago abona a la deuda, en la moneda de la deuda. Pagado con
     * soles una deuda en dólares, el monto llega en soles y se abona su
     * equivalente al tipo de cambio que se indicó (el comercial del día, que
     * se propone y se puede cambiar). Null si falta el tipo de cambio.
     *
     * @return array{monto: float, monto_pen: ?float, tipo_cambio: ?float}|null
     */
    private function abono(CuentaPorCobrar $cuenta, array $pago): ?array
    {
        $moneda = $cuenta->moneda ?: 'PEN';
        $monto = round((float) $pago['monto'], 2);

        if ($moneda === 'PEN' || ($pago['moneda'] ?? $moneda) !== 'PEN') {
            return ['monto' => $monto, 'monto_pen' => null, 'tipo_cambio' => null];
        }

        $tipoCambio = (float) ($pago['tipo_cambio'] ?? 0);
        if ($tipoCambio <= 0) {
            return null;
        }

        return ['monto' => round($monto / $tipoCambio, 2), 'monto_pen' => $monto, 'tipo_cambio' => $tipoCambio];
    }

    /**
     * El ingreso de caja de un pago: la plata que de verdad entró. Pagada en
     * soles, entra en soles; si no, en la moneda de la deuda.
     *
     * @param  array{monto: float, monto_pen: ?float, tipo_cambio: ?float}  $abono
     * @return array{monto: float, moneda: string}
     */
    private function ingreso(CuentaPorCobrar $cuenta, array $abono): array
    {
        return $abono['monto_pen'] !== null
            ? ['monto' => $abono['monto_pen'], 'moneda' => 'PEN']
            : ['monto' => $abono['monto'], 'moneda' => $cuenta->moneda ?: 'PEN'];
    }

    private function recalcular(CuentaPorCobrar $cuenta): void
    {
        $pagado = (float) $cuenta->pagos()->sum('monto');
        $total = (float) $cuenta->monto_total;
        $saldo = round($total - $pagado, 2);
        $estado = $saldo <= 0.005 ? 'pagado' : ($pagado > 0 ? 'parcial' : 'pendiente');

        $cuenta->update([
            'monto_pagado' => $pagado,
            'saldo' => max($saldo, 0),
            'estado' => $estado,
        ]);
    }
}
