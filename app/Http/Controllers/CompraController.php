<?php

namespace App\Http\Controllers;

use App\Http\Requests\Compra\FinalizarCompraRequest;
use App\Http\Requests\Compra\StoreCompraRequest;
use App\Http\Requests\Compra\UpdateCompraRequest;
use App\Http\Resources\CompraResource;
use App\Models\Compra;
use App\Models\CuentaPorPagar;
use App\Models\SerieDocumento;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class CompraController extends Controller
{
    /** Relaciones que acompañan a una compra en las respuestas de detalle. */
    private const RELACIONES = [
        'proveedor:id,nombre',
        'ordenCompra:id,codigo',
        'detalles.presentacion.producto',
        'pagos',
    ];

    public function index()
    {
        $compras = Compra::with([
            'proveedor:id,nombre',
            'detalles.presentacion.producto.marca',
            // Solo las vigentes: una recepción deshecha devolvió su mercadería.
            'recepciones' => fn ($q) => $q->where('activo', true)->with('detalles'),
        ])->withCount('detalles')->latest('id')->get();

        $compras->each(fn (Compra $compra) => $this->agregarAvanceDeRecepcion($compra));

        return CompraResource::collection($compras);
    }

    public function store(StoreCompraRequest $request)
    {
        $data = $request->validated();

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
                'subtotal' => $subtotal,
                'total' => round($subtotal + $flete, 2),
                'estado' => 'registrada',
                'observaciones' => $data['observaciones'] ?? null,
                'usuario_id' => auth()->id(),
            ]);

            $this->crearDetalles($compra, $data['detalles']);
            $this->crearPagos($compra, $data['pagos'] ?? []);
            $this->sincronizarCuentaPorPagar($compra);

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
            $compra->update(collect($data)->except(['detalles', 'pagos'])->all());

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
        });

        return CompraResource::make($compra->fresh());
    }

    public function destroy(Compra $compra): JsonResponse
    {
        DB::transaction(function () use ($compra) {
            CuentaPorPagar::where('compra_id', $compra->id)->delete();
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
     * Correlativo interno propio de la compra (C001-00000001), automático desde
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

        $serie->increment('numero_actual');

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
        ];

        $cuenta ? $cuenta->update($datos) : CuentaPorPagar::create($datos);
    }

    /** Crea las líneas calculando el subtotal de cada una. */
    private function crearDetalles(Compra $compra, array $detalles): void
    {
        foreach ($detalles as $d) {
            $cantidad = (float) $d['cantidad'];
            $costo = (float) $d['costo_unitario'];

            $compra->detalles()->create([
                'producto_presentacion_id' => $d['producto_presentacion_id'],
                'cantidad' => $cantidad,
                'costo_unitario' => $costo,
                'subtotal' => round($cantidad * $costo, 2),
            ]);
        }
    }

    /** Registra los pagos, ignorando los de monto cero. */
    private function crearPagos(Compra $compra, array $pagos): void
    {
        foreach ($pagos as $pago) {
            if ((float) $pago['monto'] <= 0) {
                continue;
            }

            $compra->pagos()->create([
                'metodo' => $pago['metodo'],
                'cuenta_bancaria_id' => $pago['metodo'] === 'transferencia' ? ($pago['cuenta_bancaria_id'] ?? null) : null,
                'billetera_id' => $pago['metodo'] === 'billetera' ? ($pago['billetera_id'] ?? null) : null,
                'monto' => (float) $pago['monto'],
            ]);
        }
    }
}
