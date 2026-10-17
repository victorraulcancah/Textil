<?php

namespace App\Http\Controllers;

use App\Models\CierreCaja;
use App\Models\MovimientoCaja;
use App\Services\CierreCajaService;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;

/**
 * Registro de cierres de caja: qué se esperaba, qué se contó y todos los
 * movimientos que hubo entre la apertura y el cierre.
 */
class CierreCajaController extends Controller
{
    public function index(CierreCajaService $servicio)
    {
        $cierres = CierreCaja::with([
            'apertura:id,caja_id,usuario_id,monto_inicial,fecha_apertura',
            'apertura.caja:id,nombre,codigo,almacen_id',
            'apertura.usuario:id,name',
            'aprobador:id,name',
            'anulador:id,name',
            'cajaDestino:id,codigo,nombre',
            // Tesorería por sucursal: cada almacén ve los cierres de sus cajas.
        ])->whereHas('apertura.caja', fn ($c) => AlmacenAcceso::limitar($c))->latest('fecha_cierre')->get();

        // Totales por tipo y por método de cada apertura, en una sola consulta.
        $aperturaIds = $cierres->pluck('apertura_caja_id')->filter();

        $movimientos = MovimientoCaja::whereIn('apertura_caja_id', $aperturaIds)
            ->get(['apertura_caja_id', 'tipo', 'monto', 'moneda', 'cuenta_bancaria_id', 'billetera_id'])
            ->groupBy('apertura_caja_id');

        $cierres->each(function (CierreCaja $cierre) use ($movimientos, $servicio) {
            // Si la caja ya se abrió con otro turno, anular el cierre no la reabre: la pantalla lo avisa.
            $cierre->caja_reabierta = $servicio->cajaReabierta($cierre);

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

    /** Aprueba un cierre pendiente: desde ese momento la caja se puede abrir con lo que se dejó. */
    public function aprobar(CierreCaja $cierresCaja, CierreCajaService $servicio)
    {
        $cierresCaja->loadMissing('apertura.caja');
        AlmacenAcceso::exigir($cierresCaja->apertura?->caja?->almacen_id);

        $servicio->aprobar($cierresCaja, auth('api')->user());

        return response()->json($this->conRelaciones($cierresCaja));
    }

    /** Anula un cierre (pendiente o aprobado). Reabre la caja si nadie la abrió después; si no, solo anula el cierre y su retiro. */
    public function anular(Request $request, CierreCaja $cierresCaja, CierreCajaService $servicio)
    {
        $cierresCaja->loadMissing('apertura.caja');
        AlmacenAcceso::exigir($cierresCaja->apertura?->caja?->almacen_id);

        $datos = $request->validate(['motivo' => 'nullable|string|max:255']);
        $servicio->anular($cierresCaja, auth('api')->user(), $datos['motivo'] ?? null);

        return response()->json($this->conRelaciones($cierresCaja));
    }

    private function conRelaciones(CierreCaja $cierre): CierreCaja
    {
        return $cierre->fresh()->load([
            'apertura:id,caja_id,usuario_id,monto_inicial,fecha_apertura,estado',
            'apertura.caja:id,nombre,codigo,almacen_id',
            'apertura.usuario:id,name',
            'aprobador:id,name',
            'anulador:id,name',
            'cajaDestino:id,codigo,nombre',
        ]);
    }

    /** Detalle: el cierre con todos los movimientos de su apertura. */
    public function show(CierreCaja $cierresCaja)
    {
        $cierresCaja->load([
            'apertura:id,caja_id,usuario_id,monto_inicial,fecha_apertura',
            'apertura.caja:id,nombre,codigo,almacen_id',
            'apertura.usuario:id,name',
            'aprobador:id,name',
            'anulador:id,name',
            'cajaDestino:id,codigo,nombre',
        ]);
        AlmacenAcceso::exigir($cierresCaja->apertura?->caja?->almacen_id);

        $movimientos = MovimientoCaja::withTrashed()->withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS)->with([
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
