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

        $data = $request->validate([
            'fecha' => 'nullable|date',
            'pagos' => 'required|array|min:1',
            'pagos.*.forma_pago' => 'required|in:'.self::FORMAS,
            'pagos.*.cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'pagos.*.billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'pagos.*.monto' => 'required|numeric|min:0.01',
            'pagos.*.referencia' => 'nullable|string|max:100',
        ]);

        $totalNuevo = collect($data['pagos'])->sum(fn ($p) => (float) $p['monto']);
        if ($totalNuevo > (float) $cuenta->saldo + 0.01) {
            return response()->json(['message' => 'El pago excede el saldo pendiente.'], 422);
        }

        $fecha = $data['fecha'] ?? now()->toDateString();

        DB::transaction(function () use ($cuenta, $data, $fecha) {
            $apertura = $this->aperturaAbierta();
            foreach ($data['pagos'] as $p) {
                $cuentaBancariaId = $p['forma_pago'] === 'transferencia' ? ($p['cuenta_bancaria_id'] ?? null) : null;
                $billeteraId = $p['forma_pago'] === 'billetera' ? ($p['billetera_id'] ?? null) : null;

                $mov = $apertura
                    ? MovimientoCaja::create([
                        'apertura_caja_id' => $apertura->id,
                        'tipo' => 'egreso',
                        'cuenta_bancaria_id' => $cuentaBancariaId,
                        'billetera_id' => $billeteraId,
                        'monto' => (float) $p['monto'],
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
                    'monto' => (float) $p['monto'],
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
            'fecha' => 'nullable|date',
        ]);

        $cuenta = $pago->cuentaPorPagar;
        $pagadoOtros = (float) $cuenta->pagos()->where('id', '!=', $pago->id)->sum('monto');
        if ($pagadoOtros + (float) $data['monto'] > (float) $cuenta->monto_total + 0.01) {
            return response()->json(['message' => 'El monto excede el total de la cuenta.'], 422);
        }

        $cuentaBancariaId = $data['forma_pago'] === 'transferencia' ? ($data['cuenta_bancaria_id'] ?? null) : null;
        $billeteraId = $data['forma_pago'] === 'billetera' ? ($data['billetera_id'] ?? null) : null;

        DB::transaction(function () use ($pago, $cuenta, $data, $cuentaBancariaId, $billeteraId) {
            $pago->update([
                'forma_pago' => $data['forma_pago'],
                'cuenta_bancaria_id' => $cuentaBancariaId,
                'billetera_id' => $billeteraId,
                'monto' => (float) $data['monto'],
                'referencia' => $data['referencia'] ?? null,
                'fecha' => $data['fecha'] ?? $pago->fecha,
            ]);

            if ($pago->movimiento_caja_id) {
                MovimientoCaja::where('id', $pago->movimiento_caja_id)->update([
                    'cuenta_bancaria_id' => $cuentaBancariaId,
                    'billetera_id' => $billeteraId,
                    'monto' => (float) $data['monto'],
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
        return AperturaCaja::where('estado', 'abierta')->latest('fecha_apertura')->first();
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
