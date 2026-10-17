<?php

namespace App\Services;

use App\Models\Compra;
use App\Models\CuentaPorPagar;
use App\Models\MovimientoCaja;
use Illuminate\Validation\ValidationException;

/**
 * El dinero de una compra: los pagos que se hicieron, la salida que dejan en la caja de quien la registra y, si es al
 * crédito, la deuda con el proveedor.
 */
class CompraPagoService
{
    public function __construct(private readonly CajaService $cajas) {}

    /**
     * Registra los pagos, ignorando los de monto cero.
     *
     * Cada pago abona a la compra en su moneda (`monto`). Una compra en dólares se puede pagar con soles: ese pago llega
     * en soles y se abona su equivalente al tipo de cambio de la compra, el que se puso a mano.
     *
     * @param  list<array<string, mixed>>  $pagos
     */
    public function guardar(Compra $compra, array $pagos): void
    {
        $moneda = $compra->moneda_origen ?: 'PEN';
        $tipoCambio = (float) $compra->tipo_cambio;

        foreach ($pagos as $pago) {
            if ((float) $pago['monto'] <= 0) {
                continue;
            }

            $enSoles = $moneda !== 'PEN' && ($pago['moneda'] ?? $moneda) === 'PEN';

            // Sin tipo de cambio no hay cómo saber cuánto abonan esos soles:
            // se guardarían como si fueran dólares.
            if ($enSoles && $tipoCambio <= 0) {
                throw ValidationException::withMessages([
                    'tipo_cambio' => 'Para pagar en soles una compra en otra moneda, pon el tipo de cambio.',
                ]);
            }

            $montoPen = $enSoles ? round((float) $pago['monto'], 2) : null;

            $compra->pagos()->create([
                'metodo' => $pago['metodo'],
                'cuenta_bancaria_id' => $pago['metodo'] === 'transferencia' ? ($pago['cuenta_bancaria_id'] ?? null) : null,
                'billetera_id' => $pago['metodo'] === 'billetera' ? ($pago['billetera_id'] ?? null) : null,
                'monto' => $enSoles ? round($montoPen / $tipoCambio, 2) : (float) $pago['monto'],
                'moneda' => $moneda,
                'monto_pen' => $montoPen,
                'tipo_cambio' => $enSoles ? $tipoCambio : null,
            ]);
        }
    }

    /** Reemplaza los pagos de la compra por los nuevos. */
    public function reemplazar(Compra $compra, array $pagos): void
    {
        $compra->pagos()->delete();
        $this->guardar($compra, $pagos);
    }

    /**
     * Pone al día lo que depende de los pagos: la deuda con el proveedor y las salidas de caja. Se llama cada vez que
     * la compra cambia.
     */
    public function sincronizar(Compra $compra): void
    {
        $this->sincronizarCuentaPorPagar($compra);
        $this->sincronizarSalidasDeCaja($compra);
    }

    /**
     * Una compra al crédito deja una deuda con el proveedor. Se mantiene al día con el total y lo ya pagado (puede haber
     * adelanto), y desaparece si la compra pasa a contado.
     */
    public function sincronizarCuentaPorPagar(Compra $compra): void
    {
        $cuenta = CuentaPorPagar::where('compra_id', $compra->id)->first();

        if ($compra->forma_pago !== 'credito' || ! $compra->proveedor_id || $compra->estado === 'anulada') {
            $cuenta?->delete();

            return;
        }

        $total = round((float) $compra->total, 2);
        $pagado = round((float) $compra->pagos()->sum('monto'), 2);
        $saldo = round(max($total - $pagado, 0), 2);

        $vencimiento = $compra->fecha_vencimiento
            ?? $compra->fecha?->copy()->addDays((int) $compra->dias_credito)
            ?? now();

        $datos = [
            'compra_id' => $compra->id,
            'proveedor_id' => $compra->proveedor_id,
            'monto_total' => $total,
            'monto_pagado' => $pagado,
            'saldo' => $saldo,
            'fecha_vencimiento' => $vencimiento,
            'estado' => $saldo <= 0 ? 'pagada' : ($pagado > 0 ? 'parcial' : 'pendiente'),
            // La deuda queda en la moneda en la que se pactó la compra.
            'moneda' => $compra->moneda_origen ?: 'PEN',
        ];

        $cuenta ? $cuenta->update($datos) : CuentaPorPagar::create($datos);
    }

    /**
     * Lo que se paga al contado sale de la caja: un egreso por cada pago de la compra, en la caja abierta de quien la
     * registra. Se rehace completo cada vez que la compra cambia, y una compra anulada no deja ninguno.
     */
    public function sincronizarSalidasDeCaja(Compra $compra): void
    {
        $this->quitarSalidasDeCaja($compra);

        if ($compra->estado === 'anulada' || $compra->forma_pago !== 'contado') {
            return;
        }

        // Una compra de contado con pagos saca el dinero de la caja de quien la registra: debe estar abierta.
        if (! $compra->pagos()->exists()) {
            return;
        }
        $apertura = $this->cajas->exigirApertura();

        $motivo = $this->cajas->motivo('Salida por pago de compra');
        $documento = $compra->numero_compra ?? "#{$compra->id}";

        foreach ($compra->pagos()->get() as $pago) {
            // Pagado con soles una compra en otra moneda: salieron soles.
            $enSoles = $pago->monto_pen !== null;

            MovimientoCaja::create([
                'apertura_caja_id' => $apertura->id,
                'tipo' => 'egreso',
                'motivo_movimiento_id' => $motivo,
                'descripcion' => "Pago de la compra {$documento}",
                'cuenta_bancaria_id' => $pago->metodo === 'transferencia' ? $pago->cuenta_bancaria_id : null,
                'billetera_id' => $pago->metodo === 'billetera' ? $pago->billetera_id : null,
                'monto' => $enSoles ? $pago->monto_pen : $pago->monto,
                'moneda' => $enSoles ? 'PEN' : ($pago->moneda ?: 'PEN'),
                'fecha' => optional($compra->fecha)->toDateString() ?? now()->toDateString(),
                'documento_referencia_tipo' => 'compra',
                'documento_referencia_id' => $compra->id,
            ]);
        }
    }

    /** Borra las salidas de caja de la compra. */
    public function quitarSalidasDeCaja(Compra $compra): void
    {
        MovimientoCaja::where('documento_referencia_tipo', 'compra')
            ->where('documento_referencia_id', $compra->id)
            ->delete();
    }
}
