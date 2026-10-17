<?php

namespace App\Services;

use App\Models\AperturaCaja;
use App\Models\MovimientoCaja;

/** El arqueo de una apertura de caja: lo que se espera en el cajón, lo que no se cuenta a mano y los dólares aparte. */
class CajaResumenService
{
    /**
     * En la caja física solo hay billetes y monedas. Un cobro por Yape o
     * transferencia queda registrado como movimiento, pero el dinero entra al
     * banco, no al cajón: si se sumara al esperado, el arqueo saldría siempre
     * con faltante. Por eso `esperado` cuenta únicamente el efectivo, y lo
     * demás se informa aparte.
     */
    public function deApertura(AperturaCaja $apertura): array
    {
        $todos = MovimientoCaja::where('apertura_caja_id', $apertura->id)
            ->get(['tipo', 'monto', 'moneda', 'cuenta_bancaria_id', 'billetera_id']);

        // Soles y dólares no se suman: lo de arriba es en soles y los dólares
        // van en su propio bloque (null si no hubo ninguno).
        $movimientos = $todos->filter(fn ($m) => ($m->moneda ?: 'PEN') === 'PEN');
        $dolares = $todos->where('moneda', 'USD');

        $enEfectivo = fn ($m) => ! $m->cuenta_bancaria_id && ! $m->billetera_id;

        $suma = fn ($coleccion) => round((float) $coleccion->sum('monto'), 2);

        $ingresos = $movimientos->where('tipo', 'ingreso');
        $egresos = $movimientos->where('tipo', 'egreso');

        $inicial = round((float) $apertura->monto_inicial, 2);
        $efectivoIngresos = $suma($ingresos->filter($enEfectivo));
        $efectivoEgresos = $suma($egresos->filter($enEfectivo));

        return [
            'monto_inicial' => $inicial,
            'ingresos' => $suma($ingresos),
            'egresos' => $suma($egresos),
            // Desglose: lo que se cuenta a mano y lo que no.
            'efectivo_ingresos' => $efectivoIngresos,
            'efectivo_egresos' => $efectivoEgresos,
            'otros_ingresos' => $suma($ingresos->reject($enEfectivo)),
            'otros_egresos' => $suma($egresos->reject($enEfectivo)),
            'esperado' => round($inicial + $efectivoIngresos - $efectivoEgresos, 2),
            'movimientos' => $todos->count(),
            'dolares' => $dolares->isEmpty() ? null : $this->bloqueDolares($dolares, $enEfectivo, $suma),
        ];
    }

    /** Lo mismo para los dólares: el cajón arranca sin dólares. */
    private function bloqueDolares($dolares, $enEfectivo, $suma): array
    {
        $ingresos = $dolares->where('tipo', 'ingreso');
        $egresos = $dolares->where('tipo', 'egreso');
        $efectivoIngresos = $suma($ingresos->filter($enEfectivo));
        $efectivoEgresos = $suma($egresos->filter($enEfectivo));

        return [
            'ingresos' => $suma($ingresos),
            'egresos' => $suma($egresos),
            'efectivo_ingresos' => $efectivoIngresos,
            'efectivo_egresos' => $efectivoEgresos,
            'otros_ingresos' => $suma($ingresos->reject($enEfectivo)),
            'otros_egresos' => $suma($egresos->reject($enEfectivo)),
            'esperado' => round($efectivoIngresos - $efectivoEgresos, 2),
        ];
    }
}
