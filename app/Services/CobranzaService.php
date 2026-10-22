<?php

namespace App\Services;

use App\Models\CuentaPorCobrar;
use App\Models\MovimientoCaja;

/**
 * El cobro de las cuentas por cobrar: cada abono genera su movimiento de caja y su pago, y la cuenta se recalcula.
 * Lo usa el cobro de un documento y el cobro de varios documentos con un mismo pago.
 */
class CobranzaService
{
    /**
     * Lo que un pago abona a la deuda, en la moneda de la deuda. Pagado con soles una deuda en dólares, el monto llega en
     * soles y se abona su equivalente al tipo de cambio que se indicó (el comercial del día, que se propone y se puede
     * cambiar). Null si falta el tipo de cambio.
     *
     * @return array{monto: float, monto_pen: ?float, tipo_cambio: ?float}|null
     */
    public function abono(CuentaPorCobrar $cuenta, array $pago): ?array
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
     * El ingreso de caja de un pago: la plata que de verdad entró. Pagada en soles, entra en soles; si no, en la moneda
     * de la deuda.
     *
     * @param  array{monto: float, monto_pen: ?float, tipo_cambio: ?float}  $abono
     * @return array{monto: float, moneda: string}
     */
    public function ingreso(CuentaPorCobrar $cuenta, array $abono): array
    {
        return $abono['monto_pen'] !== null
            ? ['monto' => $abono['monto_pen'], 'moneda' => 'PEN']
            : ['monto' => $abono['monto'], 'moneda' => $cuenta->moneda ?: 'PEN'];
    }

    /**
     * Registra los pagos (uno o varios métodos) contra una cuenta: un movimiento de caja y un pago por cada uno. Quien
     * llama valida los importes y abre la transacción.
     *
     * @param  list<array<string, mixed>>  $pagos  forma_pago, cuenta_bancaria_id, billetera_id, monto, referencia, moneda, tipo_cambio
     */
    public function registrar(CuentaPorCobrar $cuenta, array $pagos, string $fecha, ?string $glosa): void
    {
        $caja = app(CajaService::class);
        $apertura = $caja->aperturaPara();

        foreach ($pagos as $p) {
            $abono = $this->abono($cuenta, $p);
            $ingreso = $this->ingreso($cuenta, $abono);
            $cuentaBancariaId = $p['forma_pago'] === 'transferencia' ? ($p['cuenta_bancaria_id'] ?? null) : null;
            $billeteraId = $p['forma_pago'] === 'billetera' ? ($p['billetera_id'] ?? null) : null;

            $mov = $apertura
                ? MovimientoCaja::create([
                    'apertura_caja_id' => $apertura->id,
                    'tipo' => 'ingreso',
                    'motivo_movimiento_id' => $caja->motivo('Ingreso por cobranza'),
                    'descripcion' => filled($glosa)
                        ? $glosa
                        : 'Cobranza'.($cuenta->notaVenta ? " de la venta {$cuenta->notaVenta->serie}-{$cuenta->notaVenta->numero}" : '')
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
                'glosa' => $glosa,
                'movimiento_caja_id' => $mov?->id,
                'fecha' => $fecha,
            ]);

            // Cobrado con soles: ese tipo de cambio queda como el comercial del día.
            if ($abono['monto_pen'] !== null) {
                app(TipoCambioService::class)->recordarComercial($abono['tipo_cambio'], $fecha);
            }
        }

        $this->recalcular($cuenta);
    }

    /**
     * Reparte un mismo pago entre varios documentos: a cada documento se le asigna, en orden, lo que necesita de los
     * métodos recibidos (una transferencia de 300 que paga 100 + 200 deja un abono de 100 y otro de 200, con la misma
     * referencia). Cada abono queda con su propio movimiento de caja.
     *
     * @param  list<array{cuenta: CuentaPorCobrar, monto: float}>  $documentos
     * @param  list<array<string, mixed>>  $pagos  los métodos recibidos; su suma es igual a la de los documentos
     */
    public function registrarVarios(array $documentos, array $pagos, string $fecha, ?string $glosa): void
    {
        // En centavos enteros: sin errores de redondeo al repartir.
        $restantes = array_map(fn ($p) => (int) round(((float) $p['monto']) * 100), $pagos);
        $i = 0;

        foreach ($documentos as $d) {
            $falta = (int) round($d['monto'] * 100);
            $asignados = [];

            while ($falta > 0 && $i < count($pagos)) {
                $toma = min($falta, $restantes[$i]);
                if ($toma > 0) {
                    $asignados[] = array_merge($pagos[$i], ['monto' => $toma / 100]);
                    $restantes[$i] -= $toma;
                    $falta -= $toma;
                }
                if ($restantes[$i] === 0) {
                    $i++;
                }
            }

            $this->registrar($d['cuenta'], $asignados, $fecha, $glosa);
        }
    }

    /**
     * Pone al día la cuenta: lo pagado, el saldo y el estado. En soles, lo que falta si es menos de S/ 1 ya no se cobra:
     * se perdona como ajuste por redondeo y la cuenta queda cancelada. Solo después de haber cobrado algo (una cuota de
     * menos de S/ 1 sí se cobra).
     */
    public function recalcular(CuentaPorCobrar $cuenta): void
    {
        $pagado = (float) $cuenta->pagos()->sum('monto');
        $total = (float) $cuenta->monto_total;
        $resto = round($total - $pagado, 2);

        $ajuste = ($cuenta->moneda ?: 'PEN') === 'PEN' && $pagado > 0 && $resto > 0.005 && $resto < 1 ? $resto : 0.0;
        $saldo = round($resto - $ajuste, 2);
        $estado = $saldo <= 0.005 ? 'pagado' : ($pagado > 0 ? 'parcial' : 'pendiente');

        $cuenta->update([
            'monto_pagado' => $pagado,
            'saldo' => max($saldo, 0),
            'ajuste_redondeo' => $ajuste,
            'estado' => $estado,
        ]);
    }
}
