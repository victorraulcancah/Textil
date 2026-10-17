<?php

namespace App\Services;

use App\Models\Compra;
use Illuminate\Validation\ValidationException;

/** Los gastos de una compra (flete, aduana, seguro…) y su paso a la moneda de la compra. */
class CompraGastoService
{
    /**
     * Guarda los gastos de la compra. Cada uno se escribe en su moneda (los de aduana suelen ser en soles) y se guarda
     * también en la moneda de la compra, que es con la que se reparte entre las líneas.
     *
     * @param  list<array<string, mixed>>  $gastos
     */
    public function guardar(Compra $compra, array $gastos): void
    {
        $monedaCompra = $compra->moneda_origen ?: 'PEN';

        foreach ($gastos as $g) {
            $moneda = $g['moneda'] ?? $monedaCompra;
            $origen = round((float) $g['monto'], 2);
            // El tipo de cambio del día del gasto; si no lo trae, el de la compra.
            $tipoCambio = (float) ($g['tipo_cambio'] ?? 0) ?: (float) $compra->tipo_cambio;

            // A la moneda de la compra: los soles de una compra en dólares se pasan con ese tipo
            // de cambio, y los dólares de una compra en soles, al revés.
            $monto = match (true) {
                $moneda === $monedaCompra => $origen,
                $monedaCompra !== 'PEN' && $moneda === 'PEN' && $tipoCambio > 0 => round($origen / $tipoCambio, 2),
                $monedaCompra === 'PEN' && $moneda !== 'PEN' && $tipoCambio > 0 => round($origen * $tipoCambio, 2),
                default => throw ValidationException::withMessages([
                    'gastos' => "Para el gasto \"{$g['concepto']}\" en {$moneda}, pon el tipo de cambio.",
                ]),
            };

            // Lo que fue en soles: el monto mismo, o los dólares por el tipo de cambio.
            $enSoles = match (true) {
                $moneda === 'PEN' => $origen,
                $moneda === 'USD' && $tipoCambio > 0 => round($origen * $tipoCambio, 2),
                default => null,
            };

            $compra->gastos()->create([
                'concepto' => trim($g['concepto']),
                'fecha' => $g['fecha'] ?? null,
                'monto_origen' => $origen,
                'moneda' => $moneda,
                'tipo_cambio' => $moneda === 'PEN' && $monedaCompra === 'PEN' ? null : ($tipoCambio > 0 ? $tipoCambio : null),
                'monto_pen' => $enSoles,
                'monto' => $monto,
                'incluye_costo' => (bool) ($g['incluye_costo'] ?? true),
            ]);
        }
    }

    /** Reemplaza los gastos de la compra por los nuevos. */
    public function reemplazar(Compra $compra, array $gastos): void
    {
        $compra->gastos()->delete();
        $this->guardar($compra, $gastos);
    }
}
