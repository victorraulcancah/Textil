<?php

namespace App\Http\Controllers;

use App\Models\CuentaPorCobrar;
use App\Models\Empresa;
use App\Models\LetraCambio;
use App\Support\AlmacenAcceso;
use App\Models\MovimientoCaja;
use App\Models\SerieDocumento;
use App\Services\CajaService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Letras de cambio: se emiten desde una cuenta por cobrar y se consultan aquí.
 * Solo se pueden anular; una letra emitida es un título valor y no se edita.
 */
class LetraCambioController extends Controller
{
    private const SERIE = 'L001';

    /** Las letras de cambio emitidas desde cuentas por cobrar (las renovaciones tienen su propia lista). */
    public function index()
    {
        return response()->json($this->lista()->whereNull('letra_anterior_id')->get());
    }

    /** Las renovaciones: letras que nacieron de renovar otra, con su serie RV001-NNN. */
    public function renovaciones()
    {
        return response()->json($this->lista()->whereNotNull('letra_anterior_id')->get());
    }

    private function lista()
    {
        // La proforma (venta) que se canjea por la letra: sale de la cuenta por cobrar de la que se giró.
        return LetraCambio::with('cliente:id,nombre', 'anterior:id,numero,serie_renovacion', 'renovacion:id,numero,serie_renovacion,letra_anterior_id', 'cuentaPorCobrar:id,nota_venta_id,numero_cuota,total_cuotas', 'cuentaPorCobrar.notaVenta:id,serie,numero,fecha_emision')->latest('id')
            // Tesorería por sucursal: cada almacén ve las letras de las suyas.
            ->where(fn ($q) => AlmacenAcceso::limitar($q));
    }

    public function show(LetraCambio $letrasCambio)
    {
        AlmacenAcceso::exigir($letrasCambio->almacen_id);
        return response()->json($letrasCambio->load('cliente:id,nombre', 'cuentaPorCobrar:id,nota_venta_id,saldo,moneda'));
    }

    /**
     * Lo que ya se sabe al emitir la letra de una cuenta por cobrar: el documento
     * que se financia, los datos del cliente (el aceptante), el vencimiento y el
     * saldo. Se completa en el formulario; el aval y el banco los escribe quien emite.
     */
    public function prellenar(Request $request)
    {
        $request->validate(['cuenta_id' => 'required|exists:cuentas_por_cobrar,id']);

        $cuenta = CuentaPorCobrar::with('cliente', 'notaVenta:id,serie,numero')->findOrFail($request->integer('cuenta_id'));
        AlmacenAcceso::exigir($cuenta->almacen_id);
        $cliente = $cuenta->cliente;
        $empresa = Empresa::query()->where('activa', true)->first() ?? Empresa::first();

        // Lo que ya se emitió en letras de esta cuenta no se puede volver a girar.
        $enLetras = (float) LetraCambio::where('cuenta_por_cobrar_id', $cuenta->id)->where('estado', 'emitida')->sum('saldo');

        return response()->json([
            'cuenta_por_cobrar_id' => $cuenta->id,
            'referencia' => $cuenta->notaVenta ? "{$cuenta->notaVenta->serie}-{$cuenta->notaVenta->numero}" : '',
            'fecha_giro' => now()->toDateString(),
            'lugar_giro' => mb_strtoupper(trim(collect([$empresa?->distrito, $empresa?->provincia])->filter()->implode(' '))),
            'fecha_vencimiento' => $cuenta->fecha_vencimiento?->toDateString(),
            'moneda' => $cuenta->moneda ?: 'PEN',
            'importe' => max(round((float) $cuenta->saldo - $enLetras, 2), 0),
            'saldo' => (float) $cuenta->saldo,
            'en_letras' => $enLetras,
            'aceptante_nombre' => $cliente?->nombre,
            'aceptante_documento' => $cliente?->numero_documento,
            'aceptante_domicilio' => $cliente?->direccion,
            'aceptante_localidad' => '',
            'aceptante_telefono' => $cliente?->telefono,
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            // Sin cuenta por cobrar es una letra suelta (por ejemplo, de un préstamo): lleva su concepto y su cliente.
            'cuenta_por_cobrar_id' => 'nullable|exists:cuentas_por_cobrar,id',
            'cliente_id' => 'nullable|exists:clientes,id',
            'concepto' => 'nullable|string|max:80',
            'referencia' => 'nullable|string|max:60',
            'fecha_giro' => 'required|date',
            'lugar_giro' => 'nullable|string|max:120',
            'fecha_vencimiento' => 'required|date|after_or_equal:fecha_giro',
            'moneda' => ['required', Rule::in(['PEN', 'USD'])],
            'importe' => 'required|numeric|min:0.01',

            'aceptante_nombre' => 'required|string|max:255',
            'aceptante_documento' => 'nullable|string|max:20',
            'aceptante_domicilio' => 'nullable|string|max:255',
            'aceptante_localidad' => 'nullable|string|max:120',
            'aceptante_telefono' => 'nullable|string|max:30',

            'aval_nombre' => 'nullable|string|max:255',
            'aval_documento' => 'nullable|string|max:20',
            'aval_domicilio' => 'nullable|string|max:255',
            'aval_localidad' => 'nullable|string|max:120',

            // El segundo aval permanente.
            'aval2_nombre' => 'nullable|string|max:255',
            'aval2_documento' => 'nullable|string|max:20',
            'aval2_domicilio' => 'nullable|string|max:255',
            'aval2_localidad' => 'nullable|string|max:120',

            'banco' => 'nullable|string|max:80',
            'oficina' => 'nullable|string|max:20',
            'cuenta' => 'nullable|string|max:40',
            'dc' => 'nullable|string|max:4',
        ], [
            'fecha_vencimiento.after_or_equal' => 'El vencimiento no puede ser anterior a la fecha de giro.',
        ]);

        $letra = DB::transaction(function () use ($data) {
            // Letra suelta: no hay deuda de una venta que comprobar; se gira por lo que se escribe.
            if (empty($data['cuenta_por_cobrar_id'])) {
                return LetraCambio::create($data + [
                    'almacen_id' => AlmacenAcceso::propio() ?? \App\Models\Almacen::orderBy('id')->value('id'),
                    'numero' => $this->siguienteNumero(),
                    'serie_letra' => $this->siguienteSerieLetra(),
                    'estado' => 'emitida',
                    'saldo' => $data['importe'],
                    'sub_estado' => 'en_cartera',
                    'usuario_id' => auth('api')->id(),
                ]);
            }

            $cuenta = CuentaPorCobrar::lockForUpdate()->findOrFail($data['cuenta_por_cobrar_id']);
            AlmacenAcceso::exigir($cuenta->almacen_id);

            if (in_array($cuenta->estado, ['anulado', 'pagado'], true)) {
                abort(422, 'Esta cuenta ya no tiene saldo por cobrar: no se puede girar una letra.');
            }

            // La suma de las letras vigentes no puede pasar de lo que se debe.
            $enLetras = (float) LetraCambio::where('cuenta_por_cobrar_id', $cuenta->id)->where('estado', 'emitida')->sum('saldo');
            if ($enLetras + (float) $data['importe'] > (float) $cuenta->saldo + 0.01) {
                abort(422, 'El importe excede lo que falta por girar de esta cuenta (saldo '.number_format((float) $cuenta->saldo - $enLetras, 2).').');
            }

            // La letra se gira en la moneda de la deuda que financia.
            $data['moneda'] = $cuenta->moneda ?: 'PEN';

            return LetraCambio::create($data + [
                'almacen_id' => $cuenta->almacen_id,
                'cliente_id' => $cuenta->cliente_id,
                'numero' => $this->siguienteNumero(),
                // Una letra lleva su serie LT001-NNN; una renovación (otro documento) no la usa.
                'serie_letra' => $this->siguienteSerieLetra(),
                'estado' => 'emitida',
                'saldo' => $data['importe'],
                'sub_estado' => 'en_cartera',
                'usuario_id' => auth('api')->id(),
            ]);
        });

        return response()->json($letra->load('cliente:id,nombre'), 201);
    }

    /**
     * Cobra la letra, completa o una parte: el cobro se registra como un pago de la cuenta
     * por cobrar de la que salió (con su movimiento de caja). Si se cobra todo el saldo,
     * la letra queda "pagada"; si se cobra una parte, queda por cobrar con el saldo que falta
     * (que se puede cobrar después o renovar en una letra nueva). Una letra en dólares se
     * puede cobrar con soles, al tipo de cambio que se indique.
     */
    public function cobrar(Request $request, LetraCambio $letrasCambio)
    {
        AlmacenAcceso::exigir($letrasCambio->almacen_id);
        $data = $request->validate([
            'fecha' => 'required|date|before_or_equal:'.now()->toDateString(),
            // Lo que se cobra, en la moneda de la letra; sin decir nada, todo el saldo.
            'monto' => 'nullable|numeric|min:0.01',
            'forma_pago' => 'required|in:efectivo,transferencia,billetera',
            'cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'referencia' => 'nullable|string|max:100',
            'moneda' => 'nullable|in:PEN,USD',
            'tipo_cambio' => 'nullable|numeric|min:0.0001',
        ]);

        if ($letrasCambio->estado !== 'emitida') {
            return response()->json(['message' => match ($letrasCambio->estado) {
                'pagada' => 'La letra ya está pagada.',
                'cancelada' => 'La letra está cancelada: su saldo pasó a una letra nueva.',
                default => 'La letra está anulada.',
            }], 422);
        }

        $cuenta = $letrasCambio->cuentaPorCobrar;

        $saldo = (float) $letrasCambio->saldo;
        $cobrado = round((float) ($data['monto'] ?? $saldo), 2);
        if ($cobrado > $saldo + 0.01) {
            return response()->json(['message' => 'El monto excede el saldo de la letra ('.number_format($saldo, 2).').'], 422);
        }
        $completo = $cobrado >= $saldo - 0.01;
        if ($completo) {
            $cobrado = $saldo;
        }

        $monedaDeuda = $cuenta ? ($cuenta->moneda ?: 'PEN') : ($letrasCambio->moneda ?: 'PEN');
        $enSoles = $monedaDeuda !== 'PEN' && ($data['moneda'] ?? null) === 'PEN';
        if ($enSoles && empty($data['tipo_cambio'])) {
            return response()->json(['message' => 'Para cobrar en soles una letra en dólares, pon el tipo de cambio.'], 422);
        }

        $pago = [
            'forma_pago' => $data['forma_pago'],
            'cuenta_bancaria_id' => $data['cuenta_bancaria_id'] ?? null,
            'billetera_id' => $data['billetera_id'] ?? null,
            'referencia' => $data['referencia'] ?? null,
            'monto' => $enSoles ? round($cobrado * (float) $data['tipo_cambio'], 2) : $cobrado,
        ] + ($enSoles ? ['moneda' => 'PEN', 'tipo_cambio' => (float) $data['tipo_cambio']] : []);

        // Una letra suelta (sin cuenta por cobrar, como las de préstamos): lo cobrado entra a caja.
        if (! $cuenta) {
            // Cobrar mueve dinero: hace falta tener caja y que esté abierta.
            app(CajaService::class)->exigirApertura();

            DB::transaction(function () use ($letrasCambio, $completo, $saldo, $cobrado, $data, $pago, $enSoles) {
                $letrasCambio->update([
                    'saldo' => $completo ? 0 : round($saldo - $cobrado, 2),
                    'monto_pagado' => round((float) $letrasCambio->monto_pagado + $cobrado, 2),
                ] + ($completo ? ['estado' => 'pagada', 'fecha_pago' => $data['fecha']] : []));

                $apertura = app(CajaService::class)->aperturaPara();
                if ($apertura) {
                    MovimientoCaja::create([
                        'apertura_caja_id' => $apertura->id,
                        'tipo' => 'ingreso',
                        'motivo_movimiento_id' => app(CajaService::class)->motivo('Ingreso por cobranza'),
                        'descripcion' => $this->descripcionCobro($letrasCambio, $letrasCambio->concepto),
                        'cuenta_bancaria_id' => $pago['cuenta_bancaria_id'],
                        'billetera_id' => $pago['billetera_id'],
                        'monto' => $pago['monto'],
                        'moneda' => $enSoles ? 'PEN' : ($letrasCambio->moneda ?: 'PEN'),
                        'fecha' => $data['fecha'],
                        'numero_operacion' => $pago['referencia'],
                        'documento_referencia_tipo' => 'letra_cambio',
                        'documento_referencia_id' => $letrasCambio->id,
                    ]);
                }
            });

            return response()->json($letrasCambio->fresh()->load('cliente:id,nombre'));
        }

        DB::beginTransaction();
        try {
            // Primero baja el saldo de la letra: lo que se cobra deja de contar como "en letras".
            $letrasCambio->update([
                'saldo' => $completo ? 0 : round($saldo - $cobrado, 2),
                'monto_pagado' => round((float) $letrasCambio->monto_pagado + $cobrado, 2),
            ] + ($completo ? ['estado' => 'pagada', 'fecha_pago' => $data['fecha']] : []));

            $ultimoMovimiento = (int) MovimientoCaja::max('id');
            $peticion = Request::create('/', 'POST', ['fecha' => $data['fecha'], 'pagos' => [$pago]]);
            $respuesta = app(CuentaPorCobrarController::class)->registrarPago($peticion, $cuenta->fresh());

            if ($respuesta->getStatusCode() >= 400) {
                DB::rollBack();

                return $respuesta;
            }

            // En Mi Caja y en Movimientos de caja se ve que el cobro fue de una letra o de una renovación,
            // no solo "Cobranza de la venta": así se reconoce de dónde entró el dinero.
            $venta = $cuenta->notaVenta ? "{$cuenta->notaVenta->serie}-{$cuenta->notaVenta->numero}" : null;
            MovimientoCaja::where('id', '>', $ultimoMovimiento)
                ->where('documento_referencia_tipo', 'cuenta_por_cobrar')
                ->where('documento_referencia_id', $cuenta->id)
                ->update(['descripcion' => $this->descripcionCobro($letrasCambio, $venta ? "venta {$venta}" : null)]);
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        return response()->json($letrasCambio->fresh()->load('cliente:id,nombre'));
    }

    /**
     * Renueva la letra: gira una letra nueva por lo que falta cobrar (su saldo) y la letra
     * anterior queda cancelada, porque lo que debía ya se cobró o pasó a la nueva. Los datos del
     * aceptante, el aval y la cuenta a debitar se copian; se indican las fechas de la nueva.
     */
    public function renovar(Request $request, LetraCambio $letrasCambio)
    {
        AlmacenAcceso::exigir($letrasCambio->almacen_id);
        $data = $request->validate([
            'fecha_giro' => 'required|date',
            'fecha_vencimiento' => 'required|date|after_or_equal:fecha_giro',
            'lugar_giro' => 'nullable|string|max:120',
        ], [
            'fecha_vencimiento.after_or_equal' => 'El vencimiento no puede ser anterior a la fecha de giro.',
        ]);

        if ($letrasCambio->estado !== 'emitida' || (float) $letrasCambio->saldo <= 0.005) {
            return response()->json(['message' => 'Solo se renueva una letra por cobrar con saldo.'], 422);
        }

        $nueva = DB::transaction(function () use ($letrasCambio, $data) {
            $saldo = (float) $letrasCambio->saldo;

            // La anterior se cancela primero: su saldo pasa a la nueva, así la cuenta no cuenta doble.
            $letrasCambio->update(['estado' => 'cancelada', 'saldo' => 0]);

            return LetraCambio::create([
                'almacen_id' => $letrasCambio->almacen_id,
                'numero' => $this->siguienteNumero(),
                'cuenta_por_cobrar_id' => $letrasCambio->cuenta_por_cobrar_id,
                'letra_anterior_id' => $letrasCambio->id,
                // Toda renovación lleva su propia serie: RV001-001, RV001-002…
                'serie_renovacion' => $this->siguienteSerieRenovacion(),
                'cliente_id' => $letrasCambio->cliente_id,
                'referencia' => $letrasCambio->referencia,
                'fecha_giro' => $data['fecha_giro'],
                'lugar_giro' => $data['lugar_giro'] ?? $letrasCambio->lugar_giro,
                'fecha_vencimiento' => $data['fecha_vencimiento'],
                'moneda' => $letrasCambio->moneda,
                'importe' => $saldo,
                'saldo' => $saldo,
                'aceptante_nombre' => $letrasCambio->aceptante_nombre,
                'aceptante_documento' => $letrasCambio->aceptante_documento,
                'aceptante_domicilio' => $letrasCambio->aceptante_domicilio,
                'aceptante_localidad' => $letrasCambio->aceptante_localidad,
                'aceptante_telefono' => $letrasCambio->aceptante_telefono,
                'aval_nombre' => $letrasCambio->aval_nombre,
                'aval_documento' => $letrasCambio->aval_documento,
                'aval_domicilio' => $letrasCambio->aval_domicilio,
                'aval_localidad' => $letrasCambio->aval_localidad,
                'aval2_nombre' => $letrasCambio->aval2_nombre,
                'aval2_documento' => $letrasCambio->aval2_documento,
                'aval2_domicilio' => $letrasCambio->aval2_domicilio,
                'aval2_localidad' => $letrasCambio->aval2_localidad,
                'concepto' => $letrasCambio->concepto,
                'banco' => $letrasCambio->banco,
                'oficina' => $letrasCambio->oficina,
                'cuenta' => $letrasCambio->cuenta,
                'dc' => $letrasCambio->dc,
                'estado' => 'emitida',
                'sub_estado' => 'en_cartera',
                'usuario_id' => auth('api')->id(),
            ]);
        });

        return response()->json($nueva->load('cliente:id,nombre', 'anterior:id,numero'), 201);
    }

    /** Cambia dónde está la letra mientras se cobra: cartera, cobranza libre, cobranza banco o descuento. */
    public function cambiarSubEstado(Request $request, LetraCambio $letrasCambio)
    {
        AlmacenAcceso::exigir($letrasCambio->almacen_id);
        $data = $request->validate([
            'sub_estado' => ['required', Rule::in(array_keys(LetraCambio::SUB_ESTADOS))],
        ]);

        if ($letrasCambio->estado !== 'emitida') {
            return response()->json(['message' => 'Solo se cambia el sub estado de una letra por cobrar.'], 422);
        }

        $letrasCambio->update($data);

        return response()->json($letrasCambio->fresh()->load('cliente:id,nombre'));
    }

    /** La letra queda anulada (no se borra: el número ya existió y hay que poder rastrearlo). */
    public function anular(LetraCambio $letrasCambio)
    {
        AlmacenAcceso::exigir($letrasCambio->almacen_id);
        if (in_array($letrasCambio->estado, ['pagada', 'cancelada'], true) || (float) $letrasCambio->monto_pagado > 0) {
            return response()->json(['message' => 'La letra ya tiene cobros o fue renovada: no se puede anular.'], 422);
        }

        if ($letrasCambio->estado !== 'anulada') {
            $letrasCambio->update(['estado' => 'anulada']);
        }

        return response()->json($letrasCambio->fresh()->load('cliente:id,nombre'));
    }

    /** "Cobro de la letra LT001-001 (venta PF01-001)" o, si nació de renovar otra, "Cobro de la renovación RV001-002 (…)". */
    private function descripcionCobro(LetraCambio $letra, ?string $detalle): string
    {
        $que = $letra->serie_renovacion ? 'renovación' : 'letra';

        return "Cobro de la {$que} {$letra->codigo}".($detalle ? " ({$detalle})" : '');
    }

    /** La serie de la próxima letra: LT001-001, LT001-002… (las renovaciones no gastan estos números). */
    private function siguienteSerieLetra(): string
    {
        $serie = SerieDocumento::where('tipo_documento', 'letra_serie')
            ->where('serie', LetraCambio::SERIE)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'letra_serie', 'serie' => LetraCambio::SERIE],
                ['numero_actual' => 0, 'activo' => true],
            );
        $serie->increment('numero_actual');

        return sprintf('%s-%03d', LetraCambio::SERIE, $serie->numero_actual);
    }

    /** La serie de la próxima renovación: RV001-001, RV001-002… (correlativo propio). */
    private function siguienteSerieRenovacion(): string
    {
        $serie = SerieDocumento::where('tipo_documento', 'letra_renovacion')
            ->where('serie', 'RV001')
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'letra_renovacion', 'serie' => 'RV001'],
                ['numero_actual' => 0, 'activo' => true],
            );
        $serie->increment('numero_actual');

        return sprintf('RV001-%03d', $serie->numero_actual);
    }

    private function siguienteNumero(): int
    {
        $serie = SerieDocumento::where('tipo_documento', 'letra_cambio')
            ->where('serie', self::SERIE)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'letra_cambio', 'serie' => self::SERIE],
                ['numero_actual' => 0, 'activo' => true],
            );
        $serie->increment('numero_actual');

        return (int) $serie->numero_actual;
    }
}
