<?php

namespace App\Http\Controllers;

use App\Models\AperturaCaja;
use App\Models\Caja;
use App\Models\CierreCaja;
use App\Models\MovimientoCaja;
use App\Services\CierreCajaService;
use App\Services\MovimientoCajaService;
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
            'apertura:id,caja_id,usuario_id,monto_inicial,fecha_apertura,estado',
            'apertura.caja:id,nombre,codigo,almacen_id',
            'apertura.usuario:id,name',
            'aprobador:id,name',
            'anulador:id,name',
            'recerrador:id,name',
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

    /**
     * Anula un movimiento del turno de este cierre. Quien gestiona los cierres puede con cualquier movimiento, también
     * el efectivo de un turno ya cerrado; el cierre se recalcula (lo esperado y la diferencia) y, si hace falta, se
     * corrige con un recierre.
     */
    public function anularMovimiento(Request $request, CierreCaja $cierresCaja, int $movimiento, MovimientoCajaService $movimientos, CierreCajaService $servicio)
    {
        $modelo = $this->movimientoDelCierre($cierresCaja, $movimiento);
        $datos = $request->validate(['motivo' => 'nullable|string|max:200']);

        $movimientos->anular($modelo, trim((string) ($datos['motivo'] ?? '')), auth('api')->user(), gestor: true);
        $servicio->recalcularEsperado($cierresCaja);

        return response()->json($this->conRelaciones($cierresCaja));
    }

    /** Edita un movimiento del turno de este cierre (ver `MovimientoCajaService::editar`) y recalcula el cierre. */
    public function editarMovimiento(Request $request, CierreCaja $cierresCaja, int $movimiento, MovimientoCajaService $movimientos, CierreCajaService $servicio)
    {
        $modelo = $this->movimientoDelCierre($cierresCaja, $movimiento);
        $data = $request->validate(MovimientoCajaService::REGLAS_EDICION);

        $movimientos->editar($modelo, $data, auth('api')->user(), gestor: true);
        $servicio->recalcularEsperado($cierresCaja);

        return response()->json($this->conRelaciones($cierresCaja));
    }

    /** El movimiento tiene que ser del turno de este cierre, y la sucursal accesible. */
    private function movimientoDelCierre(CierreCaja $cierre, int $id): MovimientoCaja
    {
        $cierre->loadMissing('apertura.caja');
        AlmacenAcceso::exigir($cierre->apertura?->caja?->almacen_id);

        $movimiento = MovimientoCaja::withTrashed()->withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS)->findOrFail($id);
        abort_unless((int) $movimiento->apertura_caja_id === (int) $cierre->apertura_caja_id, 404, 'Ese movimiento no es de este cierre.');

        return $movimiento;
    }

    /** Recierre: corrige lo contado, lo que se deja, los dólares y la caja destino; el cierre vuelve a quedar pendiente. */
    public function recerrar(Request $request, CierreCaja $cierresCaja, CierreCajaService $servicio)
    {
        $cierresCaja->loadMissing('apertura.caja');
        AlmacenAcceso::exigir($cierresCaja->apertura?->caja?->almacen_id);

        $datos = $request->validate([
            'monto_contado' => 'required|numeric|min:0',
            'monto_dejado' => 'nullable|numeric|min:0',
            'monto_contado_usd' => 'nullable|numeric|min:0',
            'caja_destino_id' => 'nullable|integer|exists:cajas,id',
            'motivo' => 'required|string|min:3|max:255',
        ], ['motivo.required' => 'Escribe por qué se corrige el cierre.']);

        $servicio->recerrar($cierresCaja, $datos, auth('api')->user());

        return response()->json($this->conRelaciones($cierresCaja));
    }

    /** Las otras cajas activas de la sucursal del cierre, a las que se puede enviar el efectivo, y si están abiertas. */
    public function cajasDestino(CierreCaja $cierresCaja)
    {
        $cierresCaja->loadMissing('apertura.caja');
        $origen = $cierresCaja->apertura?->caja;
        AlmacenAcceso::exigir($origen?->almacen_id);

        $abiertas = AperturaCaja::where('estado', 'abierta')->pluck('caja_id')->all();

        return response()->json(
            Caja::where('almacen_id', $origen?->almacen_id)->where('activo', true)->where('id', '!=', $origen?->id)
                ->orderBy('codigo')->get(['id', 'codigo', 'nombre'])
                ->map(fn ($c) => ['id' => $c->id, 'codigo' => $c->codigo, 'nombre' => $c->nombre, 'abierta' => in_array($c->id, $abiertas, true)])
        );
    }

    private function conRelaciones(CierreCaja $cierre): CierreCaja
    {
        return $cierre->fresh()->load([
            'apertura:id,caja_id,usuario_id,monto_inicial,fecha_apertura,estado',
            'apertura.caja:id,nombre,codigo,almacen_id',
            'apertura.usuario:id,name',
            'aprobador:id,name',
            'anulador:id,name',
            'recerrador:id,name',
            'cajaDestino:id,codigo,nombre',
        ]);
    }

    /** Detalle: el cierre con todos los movimientos de su apertura. */
    public function show(CierreCaja $cierresCaja)
    {
        $cierresCaja->load([
            'apertura:id,caja_id,usuario_id,monto_inicial,fecha_apertura,estado',
            'apertura.caja:id,nombre,codigo,almacen_id',
            'apertura.usuario:id,name',
            'aprobador:id,name',
            'anulador:id,name',
            'cajaDestino:id,codigo,nombre',
        ]);
        AlmacenAcceso::exigir($cierresCaja->apertura?->caja?->almacen_id);

        $movimientos = MovimientoCaja::withTrashed()->withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS)->with([
            'motivo:id,nombre,tipo,es_sistema',
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
