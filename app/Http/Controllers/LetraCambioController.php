<?php

namespace App\Http\Controllers;

use App\Models\CuentaPorCobrar;
use App\Models\Empresa;
use App\Models\LetraCambio;
use App\Models\SerieDocumento;
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

    public function index()
    {
        return response()->json(
            // La proforma (venta) que se canjea por la letra: sale de la cuenta por cobrar de la que se giró.
            LetraCambio::with('cliente:id,nombre', 'cuentaPorCobrar:id,nota_venta_id,numero_cuota,total_cuotas', 'cuentaPorCobrar.notaVenta:id,serie,numero,fecha_emision')->latest('id')->get(),
        );
    }

    public function show(LetraCambio $letrasCambio)
    {
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
        $cliente = $cuenta->cliente;
        $empresa = Empresa::query()->where('activa', true)->first() ?? Empresa::first();

        // Lo que ya se emitió en letras de esta cuenta no se puede volver a girar.
        $enLetras = (float) LetraCambio::where('cuenta_por_cobrar_id', $cuenta->id)->where('estado', 'emitida')->sum('importe');

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
            'cuenta_por_cobrar_id' => 'required|exists:cuentas_por_cobrar,id',
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

            'banco' => 'nullable|string|max:80',
            'oficina' => 'nullable|string|max:20',
            'cuenta' => 'nullable|string|max:40',
            'dc' => 'nullable|string|max:4',
        ], [
            'fecha_vencimiento.after_or_equal' => 'El vencimiento no puede ser anterior a la fecha de giro.',
        ]);

        $letra = DB::transaction(function () use ($data) {
            $cuenta = CuentaPorCobrar::lockForUpdate()->findOrFail($data['cuenta_por_cobrar_id']);

            if (in_array($cuenta->estado, ['anulado', 'pagado'], true)) {
                abort(422, 'Esta cuenta ya no tiene saldo por cobrar: no se puede girar una letra.');
            }

            // La suma de las letras vigentes no puede pasar de lo que se debe.
            $enLetras = (float) LetraCambio::where('cuenta_por_cobrar_id', $cuenta->id)->where('estado', 'emitida')->sum('importe');
            if ($enLetras + (float) $data['importe'] > (float) $cuenta->saldo + 0.01) {
                abort(422, 'El importe excede lo que falta por girar de esta cuenta (saldo '.number_format((float) $cuenta->saldo - $enLetras, 2).').');
            }

            // La letra se gira en la moneda de la deuda que financia.
            $data['moneda'] = $cuenta->moneda ?: 'PEN';

            return LetraCambio::create($data + [
                'cliente_id' => $cuenta->cliente_id,
                'numero' => $this->siguienteNumero(),
                'estado' => 'emitida',
                'sub_estado' => 'en_cartera',
                'usuario_id' => auth('api')->id(),
            ]);
        });

        return response()->json($letra->load('cliente:id,nombre'), 201);
    }

    /**
     * Cobra la letra completa: queda "pagada" y el cobro se registra como un pago de la
     * cuenta por cobrar de la que salió (con su movimiento de caja). Una letra en dólares
     * se puede cobrar con soles, al tipo de cambio que se indique.
     */
    public function cobrar(Request $request, LetraCambio $letrasCambio)
    {
        $data = $request->validate([
            'fecha' => 'required|date|before_or_equal:'.now()->toDateString(),
            'forma_pago' => 'required|in:efectivo,transferencia,billetera',
            'cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'referencia' => 'nullable|string|max:100',
            'moneda' => 'nullable|in:PEN,USD',
            'tipo_cambio' => 'nullable|numeric|min:0.0001',
        ]);

        if ($letrasCambio->estado !== 'emitida') {
            return response()->json(['message' => $letrasCambio->estado === 'pagada' ? 'La letra ya está pagada.' : 'La letra está anulada.'], 422);
        }

        $cuenta = $letrasCambio->cuentaPorCobrar;
        if (! $cuenta) {
            return response()->json(['message' => 'La letra no tiene una cuenta por cobrar asociada.'], 422);
        }

        $importe = (float) $letrasCambio->importe;
        $enSoles = ($cuenta->moneda ?: 'PEN') !== 'PEN' && ($data['moneda'] ?? null) === 'PEN';
        if ($enSoles && empty($data['tipo_cambio'])) {
            return response()->json(['message' => 'Para cobrar en soles una letra en dólares, pon el tipo de cambio.'], 422);
        }

        $pago = [
            'forma_pago' => $data['forma_pago'],
            'cuenta_bancaria_id' => $data['cuenta_bancaria_id'] ?? null,
            'billetera_id' => $data['billetera_id'] ?? null,
            'referencia' => $data['referencia'] ?? null,
            'monto' => $enSoles ? round($importe * (float) $data['tipo_cambio'], 2) : $importe,
        ] + ($enSoles ? ['moneda' => 'PEN', 'tipo_cambio' => (float) $data['tipo_cambio']] : []);

        DB::beginTransaction();
        try {
            // Primero deja de contar como "en letras": ese importe es el que se cobra ahora.
            $letrasCambio->update(['estado' => 'pagada', 'fecha_pago' => $data['fecha']]);

            $peticion = Request::create('/', 'POST', ['fecha' => $data['fecha'], 'pagos' => [$pago]]);
            $respuesta = app(CuentaPorCobrarController::class)->registrarPago($peticion, $cuenta->fresh());

            if ($respuesta->getStatusCode() >= 400) {
                DB::rollBack();

                return $respuesta;
            }
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        return response()->json($letrasCambio->fresh()->load('cliente:id,nombre'));
    }

    /** Cambia dónde está la letra mientras se cobra: cartera, cobranza libre, cobranza banco o descuento. */
    public function cambiarSubEstado(Request $request, LetraCambio $letrasCambio)
    {
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
        if ($letrasCambio->estado === 'pagada') {
            return response()->json(['message' => 'La letra ya está pagada: no se puede anular.'], 422);
        }

        if ($letrasCambio->estado !== 'anulada') {
            $letrasCambio->update(['estado' => 'anulada']);
        }

        return response()->json($letrasCambio->fresh()->load('cliente:id,nombre'));
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
