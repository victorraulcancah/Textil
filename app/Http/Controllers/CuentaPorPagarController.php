<?php

namespace App\Http\Controllers;

use App\Models\AperturaCaja;
use App\Models\CuentaPorPagar;
use App\Models\CuentaPorPagarPago;
use App\Models\MovimientoCaja;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CuentaPorPagarController extends Controller
{
    /** Tipos de método admitidos. */
    private const FORMAS = 'efectivo,transferencia,billetera';

    public function index()
    {
        return response()->json(
            CuentaPorPagar::with(['proveedor:id,nombre', 'recepcionCompra:id', 'compra:id,correlativo,serie,numero,tipo_documento,fecha', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre'])
                ->latest('id')
                ->get()
        );
    }

    public function show(CuentaPorPagar $cuenta)
    {
        return response()->json($cuenta->load(['proveedor:id,nombre', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }

    /** Registra uno o varios pagos (mixto) a proveedor y genera egreso de caja. */
    public function registrarPago(Request $request, CuentaPorPagar $cuenta)
    {
        if ($cuenta->estado === 'anulado' || $cuenta->estado === 'pagado') {
            return response()->json(['message' => 'La cuenta no admite más pagos.'], 422);
        }

        // Pagar mueve dinero: hace falta tener caja y que esté abierta.
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
            // Una deuda en dólares se puede pagar con soles: llega lo que
            // salió en soles y el tipo de cambio del día, puesto a mano.
            'pagos.*.moneda' => 'nullable|in:PEN,USD,CNY,EUR',
            'pagos.*.tipo_cambio' => 'nullable|numeric|min:0.0001',
        ]);

        $abonos = [];
        foreach ($data['pagos'] as $i => $p) {
            $abonos[$i] = $this->abono($cuenta, $p);
            if ($abonos[$i] === null) {
                return response()->json(['message' => 'Para pagar en soles, pon el tipo de cambio del día.'], 422);
            }
        }

        $totalNuevo = collect($abonos)->sum('monto');
        if ($totalNuevo > (float) $cuenta->saldo + 0.01) {
            return response()->json(['message' => 'El pago excede el saldo pendiente.'], 422);
        }

        $fecha = $data['fecha'] ?? now()->toDateString();

        DB::transaction(function () use ($cuenta, $data, $fecha, $abonos) {
            $apertura = $this->aperturaAbierta();
            foreach ($data['pagos'] as $i => $p) {
                $abono = $abonos[$i];
                $cuentaBancariaId = $p['forma_pago'] === 'transferencia' ? ($p['cuenta_bancaria_id'] ?? null) : null;
                $billeteraId = $p['forma_pago'] === 'billetera' ? ($p['billetera_id'] ?? null) : null;

                $mov = $apertura
                    ? MovimientoCaja::create([
                        'apertura_caja_id' => $apertura->id,
                        'tipo' => 'egreso',
                        'motivo_movimiento_id' => app(\App\Services\CajaService::class)->motivo('Salida por pago a proveedor'),
                        'descripcion' => 'Pago a '.($cuenta->proveedor?->nombre ?? 'proveedor')
                            .($cuenta->compra ? ' · compra '.($cuenta->compra->numero_compra ?? "#{$cuenta->compra->id}") : ''),
                        'cuenta_bancaria_id' => $cuentaBancariaId,
                        'billetera_id' => $billeteraId,
                        ...$this->egreso($cuenta, $abono),
                        'fecha' => $fecha,
                        'numero_operacion' => $p['referencia'] ?? null,
                        'documento_referencia_tipo' => 'cuenta_por_pagar',
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
            }
            $this->recalcular($cuenta);
        });

        return response()->json($cuenta->fresh()->load(['proveedor:id,nombre', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }

    /** Edita un pago existente y ajusta su egreso de caja. */
    public function actualizarPago(Request $request, CuentaPorPagarPago $pago)
    {
        $data = $request->validate([
            'forma_pago' => 'required|in:'.self::FORMAS,
            'cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'monto' => 'required|numeric|min:0.01',
            'referencia' => 'nullable|string|max:100',
            // El día en que se cobró/pagó de verdad: puede ser uno pasado, nunca futuro.
            'fecha' => 'nullable|date|before_or_equal:'.now()->toDateString(),
            'moneda' => 'nullable|in:PEN,USD,CNY,EUR',
            'tipo_cambio' => 'nullable|numeric|min:0.0001',
        ]);

        $cuenta = $pago->cuentaPorPagar;
        $abono = $this->abono($cuenta, $data);
        if ($abono === null) {
            return response()->json(['message' => 'Para pagar en soles, pon el tipo de cambio del día.'], 422);
        }

        $pagadoOtros = (float) $cuenta->pagos()->where('id', '!=', $pago->id)->sum('monto');
        if ($pagadoOtros + $abono['monto'] > (float) $cuenta->monto_total + 0.01) {
            return response()->json(['message' => 'El monto excede el total de la cuenta.'], 422);
        }

        $cuentaBancariaId = $data['forma_pago'] === 'transferencia' ? ($data['cuenta_bancaria_id'] ?? null) : null;
        $billeteraId = $data['forma_pago'] === 'billetera' ? ($data['billetera_id'] ?? null) : null;

        DB::transaction(function () use ($pago, $cuenta, $data, $abono, $cuentaBancariaId, $billeteraId) {
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
                    ...$this->egreso($cuenta, $abono),
                    'numero_operacion' => $data['referencia'] ?? null,
                    'fecha' => $data['fecha'] ?? $pago->fecha,
                ]);
            }

            $this->recalcular($cuenta);
        });

        return response()->json($cuenta->fresh()->load(['proveedor:id,nombre', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }

    /** Anula (elimina) un pago y revierte su egreso de caja. */
    public function anularPago(CuentaPorPagarPago $pago)
    {
        $cuenta = $pago->cuentaPorPagar;

        DB::transaction(function () use ($pago, $cuenta) {
            if ($pago->movimiento_caja_id) {
                MovimientoCaja::where('id', $pago->movimiento_caja_id)->delete();
            }
            $pago->delete();
            $this->recalcular($cuenta);
        });

        return response()->json($cuenta->fresh()->load(['proveedor:id,nombre', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }

    private function aperturaAbierta(): ?AperturaCaja
    {
        return app(\App\Services\CajaService::class)->aperturaPara();
    }

    /**
     * Lo que un pago abona a la deuda, en la moneda de la deuda.
     *
     * Una deuda en dólares se puede pagar con soles: llega lo que salió en
     * soles y el tipo de cambio del día (puesto a mano), y se abona su
     * equivalente. null si se paga en soles sin tipo de cambio.
     *
     * @return array{monto: float, monto_pen: ?float, tipo_cambio: ?float}|null
     */
    private function abono(CuentaPorPagar $cuenta, array $pago): ?array
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
     * El egreso de caja de un pago: la plata que de verdad salió. Pagada en
     * soles, sale en soles (es lo que falta en el cajón al arquear); si no,
     * en la moneda de la deuda.
     *
     * @param  array{monto: float, monto_pen: ?float, tipo_cambio: ?float}  $abono
     * @return array{monto: float, moneda: string}
     */
    private function egreso(CuentaPorPagar $cuenta, array $abono): array
    {
        return $abono['monto_pen'] !== null
            ? ['monto' => $abono['monto_pen'], 'moneda' => 'PEN']
            : ['monto' => $abono['monto'], 'moneda' => $cuenta->moneda ?: 'PEN'];
    }

    private function recalcular(CuentaPorPagar $cuenta): void
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
