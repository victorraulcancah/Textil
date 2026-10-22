<?php

namespace App\Http\Controllers;

use App\Models\AperturaCaja;
use App\Models\CuentaPorCobrar;
use App\Support\AlmacenAcceso;
use App\Models\CuentaPorCobrarPago;
use App\Models\MovimientoCaja;
use App\Services\CobranzaService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CuentaPorCobrarController extends Controller
{
    /** Tipos de método admitidos. */
    private const FORMAS = 'efectivo,transferencia,billetera';

    public function __construct(private CobranzaService $cobranza) {}

    public function index()
    {
        // Tesorería por sucursal: cada almacén ve las cuentas de sus ventas.
        return response()->json(
            AlmacenAcceso::limitar(CuentaPorCobrar::query())->with([
                'cliente:id,nombre', 'notaVenta:id,serie,numero,fecha_emision,tipo_pago,vendedor_id', 'notaVenta.vendedor:id,name', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre',
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
        AlmacenAcceso::exigir($cuenta->almacen_id);
        return response()->json($cuenta->cargarEnLetras()->load(['cliente:id,nombre', 'notaVenta:id,serie,numero,fecha_emision,tipo_pago,vendedor_id', 'notaVenta.vendedor:id,name', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }

    /** Registra uno o varios pagos (mixto) contra la cuenta y genera movimiento de caja. */
    public function registrarPago(Request $request, CuentaPorCobrar $cuenta)
    {
        AlmacenAcceso::exigir($cuenta->almacen_id);
        if ($cuenta->estado === 'anulado' || $cuenta->estado === 'pagado') {
            return response()->json(['message' => 'La cuenta no admite más pagos.'], 422);
        }

        // Cobrar mueve dinero: hace falta tener caja y que esté abierta.
        app(\App\Services\CajaService::class)->exigirApertura();

        $data = $request->validate([
            // El día en que se cobró/pagó de verdad: puede ser uno pasado, nunca futuro.
            'fecha' => 'nullable|date|before_or_equal:'.now()->toDateString(),
            // Lo que explica el abono: "CANC D: PF002-001, CLIENTE". Va a la caja como descripción.
            'glosa' => 'nullable|string|max:255',
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

        $abonos = array_map(fn ($p) => $this->cobranza->abono($cuenta, $p), $data['pagos']);
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

        DB::transaction(fn () => $this->cobranza->registrar($cuenta, $data['pagos'], $fecha, $data['glosa'] ?? null));

        return response()->json($cuenta->fresh()->cargarEnLetras()->load(['cliente:id,nombre', 'notaVenta:id,serie,numero,fecha_emision,tipo_pago,vendedor_id', 'notaVenta.vendedor:id,name', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }

    /** Edita un pago existente y ajusta su movimiento de caja. */
    /**
     * Cobra varios documentos de un mismo cliente con un solo pago: una transferencia de 300 que paga una guía de 100 y
     * otra de 200. El pago se reparte entre los documentos y cada uno queda con su abono y su movimiento de caja.
     */
    public function registrarPagoVarios(Request $request)
    {
        $data = $request->validate([
            'fecha' => 'nullable|date|before_or_equal:'.now()->toDateString(),
            'glosa' => 'nullable|string|max:255',
            'documentos' => 'required|array|min:1',
            'documentos.*.cuenta_id' => 'required|integer|distinct|exists:cuentas_por_cobrar,id',
            'documentos.*.monto' => 'required|numeric|min:0.01',
            'pagos' => 'required|array|min:1',
            'pagos.*.forma_pago' => 'required|in:'.self::FORMAS,
            'pagos.*.cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'pagos.*.billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'pagos.*.monto' => 'required|numeric|min:0.01',
            'pagos.*.referencia' => 'nullable|string|max:100',
        ]);

        $cuentas = CuentaPorCobrar::with('notaVenta:id,serie,numero')->findMany(collect($data['documentos'])->pluck('cuenta_id'))->keyBy('id');
        $documentos = [];
        foreach ($data['documentos'] as $d) {
            $cuenta = $cuentas[$d['cuenta_id']];
            AlmacenAcceso::exigir($cuenta->almacen_id);
            $nombre = $cuenta->notaVenta ? "{$cuenta->notaVenta->serie}-{$cuenta->notaVenta->numero}" : "#{$cuenta->id}";

            if (in_array($cuenta->estado, ['anulado', 'pagado'], true)) {
                return response()->json(['message' => "El documento {$nombre} ya no admite pagos."], 422);
            }
            $monto = round((float) $d['monto'], 2);
            if ($monto > $cuenta->saldoCobrable() + 0.01) {
                return response()->json(['message' => "El abono al documento {$nombre} excede su saldo cobrable (".number_format($cuenta->saldoCobrable(), 2).').'], 422);
            }
            $documentos[] = ['cuenta' => $cuenta, 'monto' => $monto];
        }

        // Un solo pago es de un solo cliente y en una sola moneda.
        if ($cuentas->pluck('cliente_id')->unique()->count() !== 1 || ! $cuentas->first()->cliente_id) {
            return response()->json(['message' => 'Los documentos de un mismo pago deben ser del mismo cliente.'], 422);
        }
        if ($cuentas->map(fn ($c) => $c->moneda ?: 'PEN')->unique()->count() !== 1) {
            return response()->json(['message' => 'Los documentos de un mismo pago deben estar en la misma moneda.'], 422);
        }

        $aplicado = round(collect($documentos)->sum('monto'), 2);
        $recibido = round(collect($data['pagos'])->sum(fn ($p) => (float) $p['monto']), 2);
        if (abs($aplicado - $recibido) > 0.005) {
            return response()->json(['message' => 'Lo recibido ('.number_format($recibido, 2).') no coincide con lo que se aplica a los documentos ('.number_format($aplicado, 2).').'], 422);
        }

        // Cobrar mueve dinero: hace falta tener caja y que esté abierta.
        app(\App\Services\CajaService::class)->exigirApertura();

        $fecha = $data['fecha'] ?? now()->toDateString();
        DB::transaction(fn () => $this->cobranza->registrarVarios($documentos, $data['pagos'], $fecha, $data['glosa'] ?? null));

        return response()->json([
            'cuentas' => CuentaPorCobrar::with(['cliente:id,nombre', 'notaVenta:id,serie,numero,fecha_emision,tipo_pago,vendedor_id', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre'])
                ->findMany($cuentas->keys())->map->cargarEnLetras()->values(),
        ]);
    }

    public function actualizarPago(Request $request, CuentaPorCobrarPago $pago)
    {
        AlmacenAcceso::exigir($pago->cuentaPorCobrar?->almacen_id);
        $data = $request->validate([
            'forma_pago' => 'required|in:'.self::FORMAS,
            'cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'monto' => 'required|numeric|min:0.01',
            'referencia' => 'nullable|string|max:100',
            'glosa' => 'nullable|string|max:255',
            // El día en que se cobró/pagó de verdad: puede ser uno pasado, nunca futuro.
            'fecha' => 'nullable|date|before_or_equal:'.now()->toDateString(),
            'moneda' => 'nullable|in:PEN,USD',
            'tipo_cambio' => 'nullable|numeric|min:0.0001',
        ]);

        $cuenta = $pago->cuentaPorCobrar;
        $abono = $this->cobranza->abono($cuenta, $data);
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
            $ingreso = $this->cobranza->ingreso($cuenta, $abono);

            $pago->update([
                'forma_pago' => $data['forma_pago'],
                'cuenta_bancaria_id' => $cuentaBancariaId,
                'billetera_id' => $billeteraId,
                'monto' => $abono['monto'],
                'monto_pen' => $abono['monto_pen'],
                'tipo_cambio' => $abono['tipo_cambio'],
                'referencia' => $data['referencia'] ?? null,
                'glosa' => $data['glosa'] ?? $pago->glosa,
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
                    ...(filled($data['glosa'] ?? null) ? ['descripcion' => $data['glosa']] : []),
                ]);
            }

            if ($abono['monto_pen'] !== null) {
                app(\App\Services\TipoCambioService::class)->recordarComercial($abono['tipo_cambio'], $data['fecha'] ?? $pago->fecha?->toDateString());
            }

            $this->cobranza->recalcular($cuenta);
        });

        return response()->json($cuenta->fresh()->cargarEnLetras()->load(['cliente:id,nombre', 'notaVenta:id,serie,numero,fecha_emision,tipo_pago,vendedor_id', 'notaVenta.vendedor:id,name', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }

    /** Anula (elimina) un pago y revierte su movimiento de caja. */
    public function anularPago(CuentaPorCobrarPago $pago)
    {
        AlmacenAcceso::exigir($pago->cuentaPorCobrar?->almacen_id);
        $cuenta = $pago->cuentaPorCobrar;

        DB::transaction(function () use ($pago, $cuenta) {
            if ($pago->movimiento_caja_id) {
                MovimientoCaja::anularDe(MovimientoCaja::where('id', $pago->movimiento_caja_id), 'Cobro anulado');
            }
            $pago->delete();
            $this->cobranza->recalcular($cuenta);
        });

        return response()->json($cuenta->fresh()->cargarEnLetras()->load(['cliente:id,nombre', 'notaVenta:id,serie,numero,fecha_emision,tipo_pago,vendedor_id', 'notaVenta.vendedor:id,name', 'pagos.cuentaBancaria:id,alias,numero_cuenta', 'pagos.billetera:id,nombre']));
    }
}
