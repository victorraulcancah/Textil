<?php

namespace App\Http\Controllers;

use App\Http\Requests\Compra\FinalizarCompraRequest;
use App\Http\Requests\Compra\StoreCompraRequest;
use App\Http\Requests\Compra\UpdateCompraRequest;
use App\Http\Resources\CompraResource;
use App\Models\Compra;
use App\Models\CuentaPorPagar;
use App\Models\MovimientoCaja;
use App\Services\CajaService;
use App\Models\SerieDocumento;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CompraController extends Controller
{
    /** Relaciones que acompañan a una compra en las respuestas de detalle. */
    private const RELACIONES = [
        'proveedor:id,nombre,tipo',
        'ordenCompra:id,codigo,proveedor_id,numero_proveedor,fecha_emision',
        'ordenCompra.proveedor:id,codigo_corto',
        'detalles.presentacion.producto',
        'detalles.color',
        'pagos',
        'gastos',
    ];

    public function index()
    {
        $compras = Compra::with([
            'proveedor:id,nombre,tipo',
            'ordenCompra:id,codigo,proveedor_id,numero_proveedor,fecha_emision',
            'ordenCompra.proveedor:id,codigo_corto',
            'detalles.presentacion.producto.marca',
            // Solo las vigentes: una recepción deshecha devolvió su mercadería.
            'recepciones' => fn ($q) => $q->where('activo', true)->with('detalles'),
        ])->withCount('detalles')->latest('id')->get();

        $compras->each(fn (Compra $compra) => $this->agregarAvanceDeRecepcion($compra));

        // Sin envoltura "data": el listado se consume como array plano.
        return CompraResource::collection($compras)->toArray(request());
    }

    public function store(StoreCompraRequest $request)
    {
        $data = $request->validated();

        // Una orden de compra solo se transforma en compra cuando ya está aprobada.
        if (! empty($data['orden_compra_id'])) {
            $orden = \App\Models\OrdenCompra::find($data['orden_compra_id']);
            if ($orden && ! in_array($orden->estado, ['aprobada', 'enviada', 'parcial', 'completada'], true)) {
                throw ValidationException::withMessages([
                    'orden_compra_id' => 'La orden de compra debe estar aprobada para transformarla en compra.',
                ]);
            }
        }

        $compra = DB::transaction(function () use ($data) {
            $subtotal = $this->calcularSubtotal($data['detalles']);
            $flete = (float) ($data['flete'] ?? 0);

            $compra = Compra::create([
                'correlativo' => $this->siguienteCorrelativo(),
                'proveedor_id' => $data['proveedor_id'] ?? null,
                'orden_compra_id' => $data['orden_compra_id'] ?? null,
                'tipo_documento' => $data['tipo_documento'],
                'serie' => $data['serie'] ?? null,
                'numero' => $data['numero'] ?? null,
                'guia' => $data['guia'] ?? null,
                'fecha' => $data['fecha'],
                'forma_pago' => $data['forma_pago'],
                'dias_credito' => $data['dias_credito'] ?? 0,
                'fecha_vencimiento' => $data['fecha_vencimiento'] ?? null,
                'flete' => $flete,

                // Datos del embarque: permiten saber de qué importación vino
                // cada rollo y con qué tipo de cambio se costeó.
                'es_importacion' => (bool) ($data['es_importacion'] ?? false),
                'numero_importacion' => $data['numero_importacion'] ?? null,
                'contenedor' => $data['contenedor'] ?? null,
                'precinto' => $data['precinto'] ?? null,
                'bl' => $data['bl'] ?? null,
                'pais_origen' => $data['pais_origen'] ?? null,
                'pais_destino' => $data['pais_destino'] ?? null,
                'puerto_embarque' => $data['puerto_embarque'] ?? null,
                'puerto_destino' => $data['puerto_destino'] ?? null,
                'cargo_type' => $data['cargo_type'] ?? null,
                'medio_transporte' => $data['medio_transporte'] ?? null,
                'incoterm' => $data['incoterm'] ?? null,
                'fecha_llegada' => $data['fecha_llegada'] ?? null,
                'fecha_embarque_estimada' => $data['fecha_embarque_estimada'] ?? null,
                'elaborado_por' => $data['elaborado_por'] ?? null,
                'aprobado_por' => $data['aprobado_por'] ?? null,
                'moneda_origen' => $data['moneda_origen'] ?? 'PEN',
                'tipo_cambio' => $data['tipo_cambio'] ?? null,

                'subtotal' => $subtotal,
                'total' => round($subtotal + $flete, 2),
                'estado' => 'registrada',
                'observaciones' => $data['observaciones'] ?? null,
                'usuario_id' => auth()->id(),
            ]);

            $this->crearDetalles($compra, $data['detalles']);
            $this->crearGastos($compra, $data['gastos'] ?? []);
            $this->crearPagos($compra, $data['pagos'] ?? []);
            $this->sincronizarCuentaPorPagar($compra);
            $this->sincronizarSalidasDeCaja($compra);

            return $compra;
        });

        return CompraResource::make($compra->load(self::RELACIONES))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Compra $compra)
    {
        return CompraResource::make($compra->load(self::RELACIONES));
    }

    /**
     * Edición de la compra. Una compra anulada queda congelada: reabrirla dejaría
     * el histórico sin correspondencia con lo que se anuló.
     */
    public function update(UpdateCompraRequest $request, Compra $compra)
    {
        if ($compra->estado === 'anulada') {
            return response()->json(['message' => 'La compra está anulada y no se puede editar.'], 422);
        }

        $data = $request->validated();

        DB::transaction(function () use ($data, $compra) {
            $compra->update(collect($data)->except(['detalles', 'pagos', 'gastos'])->all());

            if (array_key_exists('gastos', $data)) {
                $compra->gastos()->delete();
                $this->crearGastos($compra, $data['gastos'] ?? []);
            }

            // Detalles y pagos se reemplazan completos: más simple y sin huérfanos.
            if (array_key_exists('detalles', $data)) {
                $compra->detalles()->delete();
                $this->crearDetalles($compra, $data['detalles']);

                $subtotal = $this->calcularSubtotal($data['detalles']);
                $flete = (float) ($data['flete'] ?? $compra->flete);

                $compra->update([
                    'subtotal' => $subtotal,
                    'total' => round($subtotal + $flete, 2),
                ]);
            }

            if (array_key_exists('pagos', $data)) {
                $compra->pagos()->delete();
                $this->crearPagos($compra, $data['pagos'] ?? []);
            }

            $this->sincronizarCuentaPorPagar($compra->fresh());
            $this->sincronizarSalidasDeCaja($compra->fresh());
        });

        return CompraResource::make($compra->fresh()->load(self::RELACIONES));
    }

    /**
     * Cierra lo que falta por recibir: se pidieron 100, llegaron 50 y el resto ya
     * no va a llegar. El pendiente queda registrado como cantidad finalizada.
     */
    public function finalizar(FinalizarCompraRequest $request, Compra $compra)
    {
        if ($compra->estado === 'anulada') {
            return response()->json(['message' => 'La compra está anulada.'], 422);
        }
        if ($compra->finalizado) {
            return response()->json(['message' => 'La compra ya está finalizada.'], 422);
        }

        $motivo = $request->validated()['motivo'];

        DB::transaction(function () use ($motivo, $compra) {
            $pendientes = $compra->pendientePorLinea();

            foreach ($compra->detalles as $detalle) {
                $pendiente = $pendientes[$detalle->id] ?? 0;
                if ($pendiente > 0) {
                    $detalle->increment('cantidad_finalizada', $pendiente);
                }
            }

            $compra->update([
                'finalizado' => true,
                'motivo_finalizacion' => $motivo,
                'fecha_finalizacion' => now(),
                'estado' => 'recepcionada',
            ]);
        });

        return CompraResource::make(
            $compra->fresh()->load(['detalles', 'proveedor:id,nombre']),
        );
    }

    public function anular(Compra $compra)
    {
        DB::transaction(function () use ($compra) {
            $compra->update(['estado' => 'anulada']);
            // Anulada la compra, la deuda con el proveedor ya no existe.
            CuentaPorPagar::where('compra_id', $compra->id)->delete();
            // Y lo que se pagó al contado vuelve a la caja.
            $this->sincronizarSalidasDeCaja($compra->fresh());
        });

        return CompraResource::make($compra->fresh());
    }

    public function destroy(Compra $compra): JsonResponse
    {
        DB::transaction(function () use ($compra) {
            CuentaPorPagar::where('compra_id', $compra->id)->delete();
            MovimientoCaja::where('documento_referencia_tipo', 'compra')->where('documento_referencia_id', $compra->id)->delete();
            $compra->detalles()->delete();
            $compra->pagos()->delete();
            $compra->delete();
        });

        return response()->json(['message' => 'Eliminado']);
    }

    /**
     * Deja en cada línea cuánto se recibió y cuánto sigue pendiente, para que el
     * listado muestre el avance sin consultar las recepciones una por una.
     */
    private function agregarAvanceDeRecepcion(Compra $compra): void
    {
        $recibido = $compra->recepciones
            ->flatMap->detalles
            ->groupBy('compra_detalle_id')
            ->map(fn ($lineas) => (float) $lineas->sum('cantidad_recibida'));

        $compra->detalles->each(function ($d) use ($recibido) {
            $d->recibido = (float) ($recibido[$d->id] ?? 0);
            $d->pendiente = max(0, round(
                (float) $d->cantidad - $d->recibido - (float) $d->cantidad_finalizada,
                2,
            ));
        });

        // Ya se usó para calcular el avance: no hace falta enviarla.
        $compra->unsetRelation('recepciones');
    }

    /** Suma de las líneas: cantidad × costo, redondeado por línea. */
    private function calcularSubtotal(array $detalles): float
    {
        return collect($detalles)->sum(
            fn ($d) => round((float) $d['cantidad'] * (float) $d['costo_unitario'], 2),
        );
    }

    /**
     * Correlativo interno propio de la compra (C001-001), automático desde
     * 1. El usuario no lo ingresa. Se bloquea la fila para que dos compras
     * simultáneas no tomen el mismo número.
     */
    private function siguienteCorrelativo(): int
    {
        $serie = SerieDocumento::where('tipo_documento', 'compra')
            ->where('serie', Compra::SERIE_INTERNA)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'compra', 'serie' => Compra::SERIE_INTERNA],
                ['numero_actual' => 0, 'activo' => true],
            );

        // El contador puede ir por detrás de lo ya usado (datos de ejemplo, o
        // compras cargadas a mano): se saltan los correlativos ocupados para no
        // repetir el número interno de un documento.
        do {
            $serie->increment('numero_actual');
        } while (Compra::where('correlativo', $serie->numero_actual)->exists());

        return $serie->numero_actual;
    }

    /**
     * Una compra al crédito deja una deuda con el proveedor. Se mantiene al día
     * con el total y lo ya pagado (puede haber adelanto), y desaparece si la
     * compra pasa a contado.
     */
    private function sincronizarCuentaPorPagar(Compra $compra): void
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
     * Guarda los gastos de la compra. Cada uno se escribe en su moneda (los de
     * aduana suelen ser en soles) y se guarda también en la moneda de la compra,
     * que es con la que se reparte entre las líneas.
     */
    private function crearGastos(Compra $compra, array $gastos): void
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

    /** Crea las líneas calculando el subtotal de cada una. */
    private function crearDetalles(Compra $compra, array $detalles): void
    {
        foreach ($detalles as $d) {
            $cantidad = (float) $d['cantidad'];
            $costo = (float) $d['costo_unitario'];

            $compra->detalles()->create([
                'producto_presentacion_id' => $d['producto_presentacion_id'],
                'producto_color_id' => $d['producto_color_id'] ?? null,
                'color_code' => $d['color_code'] ?? null,
                'rollos' => $d['rollos'] ?? null,
                'cantidad' => $cantidad,
                'costo_unitario' => $costo,
                'subtotal' => round($cantidad * $costo, 2),
            ]);
        }
    }

    /**
     * Registra los pagos, ignorando los de monto cero.
     *
     * Cada pago abona a la compra en su moneda (`monto`). Una compra en
     * dólares se puede pagar con soles: ese pago llega en soles y se abona su
     * equivalente al tipo de cambio de la compra, el que se puso a mano.
     */
    /**
     * Lo que se paga al contado sale de la caja: un egreso por cada pago de la
     * compra, en la caja abierta de quien la registra. Se rehace completo cada
     * vez que la compra cambia, y una compra anulada no deja ninguno.
     */
    private function sincronizarSalidasDeCaja(Compra $compra): void
    {
        MovimientoCaja::where('documento_referencia_tipo', 'compra')
            ->where('documento_referencia_id', $compra->id)
            ->delete();

        if ($compra->estado === 'anulada' || $compra->forma_pago !== 'contado') {
            return;
        }

        $cajas = app(CajaService::class);
        // Una compra de contado con pagos saca el dinero de la caja de quien la registra: debe estar abierta.
        if (! $compra->pagos()->exists()) {
            return;
        }
        $apertura = $cajas->exigirApertura();

        $motivo = $cajas->motivo('Salida por pago de compra');
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

    private function crearPagos(Compra $compra, array $pagos): void
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
}
