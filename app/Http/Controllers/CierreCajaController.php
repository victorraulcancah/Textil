<?php

namespace App\Http\Controllers;

use App\Models\CierreCaja;
use App\Models\MovimientoCaja;
use App\Support\AlmacenAcceso;

/**
 * Registro de cierres de caja: qué se esperaba, qué se contó y todos los
 * movimientos que hubo entre la apertura y el cierre.
 */
class CierreCajaController extends Controller
{
    public function index()
    {
        $cierres = CierreCaja::with([
            'apertura:id,caja_id,usuario_id,monto_inicial,fecha_apertura',
            'apertura.caja:id,nombre,codigo,almacen_id',
            'apertura.usuario:id,name',
            // Tesorería por sucursal: cada almacén ve los cierres de sus cajas.
        ])->whereHas('apertura.caja', fn ($c) => AlmacenAcceso::limitar($c))->latest('fecha_cierre')->get();

        // Totales por tipo y por método de cada apertura, en una sola consulta.
        $aperturaIds = $cierres->pluck('apertura_caja_id')->filter();

        $movimientos = MovimientoCaja::whereIn('apertura_caja_id', $aperturaIds)
            ->get(['apertura_caja_id', 'tipo', 'monto', 'moneda', 'cuenta_bancaria_id', 'billetera_id'])
            ->groupBy('apertura_caja_id');

        $cierres->each(function (CierreCaja $cierre) use ($movimientos) {
            $todas = $movimientos->get($cierre->apertura_caja_id, collect());
            // Los totales son en soles; los dólares van aparte.
            $lineas = $todas->filter(fn ($m) => ($m->moneda ?: 'PEN') === 'PEN');
            $dolares = $todas->where('moneda', 'USD');
            $cierre->ingresos_usd = $dolares->isEmpty() ? null : round((float) $dolares->where('tipo', 'ingreso')->sum('monto'), 2);
            $cierre->egresos_usd = $dolares->isEmpty() ? null : round((float) $dolares->where('tipo', 'egreso')->sum('monto'), 2);

            $cierre->ingresos = round((float) $lineas->where('tipo', 'ingreso')->sum('monto'), 2);
            $cierre->egresos = round((float) $lineas->where('tipo', 'egreso')->sum('monto'), 2);
            $cierre->movimientos_count = $todas->count();

            // El efectivo es lo único que se cuenta físicamente al cerrar.
            $porMetodo = fn ($tipo, $metodo) => round((float) $lineas
                ->where('tipo', $tipo)
                ->filter(function ($m) use ($metodo) {
                    return match ($metodo) {
                        'efectivo' => ! $m->cuenta_bancaria_id && ! $m->billetera_id,
                        'transferencia' => (bool) $m->cuenta_bancaria_id,
                        'billetera' => (bool) $m->billetera_id,
                    };
                })
                ->sum('monto'), 2);

            $cierre->efectivo_ingresos = $porMetodo('ingreso', 'efectivo');
            $cierre->efectivo_egresos = $porMetodo('egreso', 'efectivo');
            $cierre->transferencias = $porMetodo('ingreso', 'transferencia') - $porMetodo('egreso', 'transferencia');
            $cierre->billeteras = $porMetodo('ingreso', 'billetera') - $porMetodo('egreso', 'billetera');
        });

        return response()->json($cierres);
    }

    /** Detalle: el cierre con todos los movimientos de su apertura. */
    public function show(CierreCaja $cierresCaja)
    {
        $cierresCaja->load([
            'apertura:id,caja_id,usuario_id,monto_inicial,fecha_apertura',
            'apertura.caja:id,nombre,codigo,almacen_id',
            'apertura.usuario:id,name',
        ]);
        AlmacenAcceso::exigir($cierresCaja->apertura?->caja?->almacen_id);

        $movimientos = MovimientoCaja::with([
            'motivo:id,nombre,tipo',
            'cuentaBancaria:id,alias,numero_cuenta',
            'billetera:id,nombre',
        ])
            ->where('apertura_caja_id', $cierresCaja->apertura_caja_id)
            ->orderBy('fecha')
            ->orderBy('id')
            ->get();

        return response()->json([
            'cierre' => $cierresCaja,
            'movimientos' => $movimientos,
        ]);
    }
}
