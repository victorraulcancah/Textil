<?php

namespace App\Http\Controllers;

use App\Models\Almacen;
use App\Models\Compra;
use App\Models\ProductoPresentacion;
use App\Models\RecepcionCompra;
use App\Models\SerieDocumento;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RecepcionCompraController extends Controller
{
    private const RELACIONES = [
        'proveedor:id,nombre',
        'almacen:id,nombre',
        'compra:id,correlativo,estado,finalizado,motivo_finalizacion,fecha_finalizacion',
        'ordenCompra:id,codigo',
        'usuarioRecibe:id,name',
        'detalles.presentacion.producto.marca',
        'detalles.compraDetalle:id,cantidad,cantidad_finalizada',
    ];

    public function index()
    {
        return response()->json(
            RecepcionCompra::with(self::RELACIONES)->withCount('detalles')->latest('id')->get()
        );
    }

    /**
     * Estado de recepción de una compra: cuánto se pidió y cuánto lleva recibido
     * cada línea. Alimenta el modal de "Recepcionar".
     */
    public function pendientesDeCompra(Compra $compra)
    {
        $compra->load(['detalles.presentacion.producto.marca', 'proveedor:id,nombre']);

        $pendientes = $compra->pendientePorLinea();
        $recibidos = $compra->recibidoPorLinea();

        $lineas = $compra->detalles->map(fn ($d) => [
            'compra_detalle_id' => $d->id,
            'producto_presentacion_id' => $d->producto_presentacion_id,
            'producto' => $d->presentacion?->producto?->nombre,
            'codigo' => $d->presentacion?->producto?->codigo,
            'marca' => $d->presentacion?->producto?->marca?->nombre,
            'unidad' => $d->presentacion?->nombre,
            'costo_unitario' => (float) $d->costo_unitario,
            'cantidad_pedida' => (float) $d->cantidad,
            'cantidad_recibida' => $recibidos[$d->id] ?? 0,
            'cantidad_finalizada' => (float) $d->cantidad_finalizada,
            'pendiente' => $pendientes[$d->id] ?? 0,
        ]);

        return response()->json([
            'compra' => [
                'id' => $compra->id,
                'numero_compra' => $compra->numero_compra,
                'proveedor_id' => $compra->proveedor_id,
                'proveedor' => $compra->proveedor?->nombre,
                'tipo_documento' => $compra->tipo_documento,
                'serie' => $compra->serie,
                'numero' => $compra->numero,
            ],
            'lineas' => $lineas,
        ]);
    }

    /**
     * Registra una recepción (total o parcial) contra una compra. No se puede
     * recibir más de lo pendiente de cada línea.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'compra_id' => 'required|exists:compras,id',
            'almacen_id' => 'required|exists:almacenes,id',
            'numero_documento' => 'nullable|string|max:255',
            'tipo_documento' => 'nullable|string|max:50',
            'fecha_recepcion' => 'required|date',
            'observaciones' => 'nullable|string',
            'detalles' => 'required|array|min:1',
            'detalles.*.compra_detalle_id' => 'required|exists:compra_detalles,id',
            'detalles.*.cantidad_recibida' => 'required|numeric|min:0.01',
        ]);

        try {
            $recepcion = DB::transaction(function () use ($data) {
                $compra = Compra::with('detalles')->lockForUpdate()->findOrFail($data['compra_id']);

                if ($compra->estado === 'anulada') {
                    throw new \RuntimeException('La compra está anulada: no admite recepciones.');
                }

                if ($compra->finalizado) {
                    throw new \RuntimeException('La compra está finalizada: ya no admite recepciones.');
                }

                $pendientes = $compra->pendientePorLinea();

                $recepcion = RecepcionCompra::create([
                    'compra_id' => $compra->id,
                    'orden_compra_id' => $compra->orden_compra_id,
                    'proveedor_id' => $compra->proveedor_id,
                    'almacen_id' => $data['almacen_id'],
                    'serie' => RecepcionCompra::SERIE,
                    'numero' => $this->siguienteNumero(),
                    'numero_documento' => $data['numero_documento'] ?? null,
                    'tipo_documento' => $data['tipo_documento'] ?? null,
                    'fecha_recepcion' => $data['fecha_recepcion'],
                    'observaciones' => $data['observaciones'] ?? null,
                    'estado' => 'parcial',
                    'activo' => true,
                    'stock_aplicado' => true,
                    'usuario_recibe_id' => auth()->id(),
                ]);

                $almacen = Almacen::findOrFail($data['almacen_id']);
                $stock = app(StockService::class);

                foreach ($data['detalles'] as $detalle) {
                    $linea = $compra->detalles->firstWhere('id', $detalle['compra_detalle_id']);
                    if (! $linea || $linea->compra_id !== $compra->id) {
                        throw new \RuntimeException('Una de las líneas no pertenece a esta compra.');
                    }

                    $cantidad = (float) $detalle['cantidad_recibida'];
                    $pendiente = $pendientes[$linea->id] ?? 0;

                    if ($cantidad > $pendiente + 0.001) {
                        throw new \RuntimeException(
                            "No puedes recibir {$cantidad} de \"{$linea->presentacion?->producto?->nombre}\": solo quedan {$pendiente} pendientes."
                        );
                    }

                    $presentacion = ProductoPresentacion::findOrFail($linea->producto_presentacion_id);
                    $costoPresentacion = (float) $linea->costo_unitario;

                    // StockService valoriza en unidad base; el costo es por presentación.
                    $factor = (float) $presentacion->factor_conversion ?: 1;
                    $costoBase = $factor > 0 ? $costoPresentacion / $factor : $costoPresentacion;

                    // El origen del movimiento es la recepción: la compra es el
                    // documento comercial, no el motivo del ingreso al almacén.
                    $movimiento = $stock->entrada(
                        $presentacion, $almacen, $cantidad, $costoBase,
                        'recepcion', 'recepcion_compra', $recepcion->id, auth()->id(),
                    );

                    $recepcion->detalles()->create([
                        'compra_detalle_id' => $linea->id,
                        'producto_presentacion_id' => $presentacion->id,
                        'cantidad_pedida' => (float) $linea->cantidad,
                        'cantidad_ordenada' => (float) $linea->cantidad,
                        'cantidad_recibida' => $cantidad,
                        'cantidad_conforme' => $cantidad,
                        'cantidad_rechazada' => 0,
                        'costo_unitario' => $costoPresentacion,
                        // El movimiento guarda el saldo resultante en unidad base.
                        'stock_anterior' => (float) $movimiento->stock_anterior,
                        'stock_nuevo' => (float) $movimiento->saldo_stock,
                    ]);
                }

                $this->refrescarEstados($recepcion->fresh(), $compra);

                return $recepcion;
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($recepcion->load(self::RELACIONES), 201);
    }

    /** Deshace la recepción: revierte el stock que ingresó y la deja inactiva. */
    public function deshacer(RecepcionCompra $recepcionesCompra)
    {
        if (! $recepcionesCompra->activo) {
            return response()->json(['message' => 'La recepción ya está deshecha.'], 422);
        }

        try {
            DB::transaction(function () use ($recepcionesCompra) {
                $almacen = $recepcionesCompra->almacen;
                $stock = app(StockService::class);

                foreach ($recepcionesCompra->detalles as $detalle) {
                    $presentacion = ProductoPresentacion::findOrFail($detalle->producto_presentacion_id);
                    $factor = (float) $presentacion->factor_conversion ?: 1;
                    $costoBase = $factor > 0 ? (float) $detalle->costo_unitario / $factor : (float) $detalle->costo_unitario;

                    $stock->salida(
                        $presentacion, $almacen, (float) $detalle->cantidad_recibida, $costoBase,
                        'recepcion_deshecha', 'recepcion_compra', $recepcionesCompra->id, auth()->id(),
                    );
                }

                $recepcionesCompra->update([
                    'activo' => false,
                    'stock_aplicado' => false,
                    'estado' => 'deshecha',
                ]);

                if ($recepcionesCompra->compra) {
                    $this->refrescarEstados($recepcionesCompra, $recepcionesCompra->compra->fresh('detalles'));
                }
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($recepcionesCompra->fresh()->load(self::RELACIONES));
    }

    public function show(RecepcionCompra $recepcionesCompra)
    {
        return response()->json($recepcionesCompra->load(self::RELACIONES));
    }

    public function update(Request $request, RecepcionCompra $recepcionesCompra)
    {
        $data = $request->validate(['observaciones' => 'nullable|string']);
        $recepcionesCompra->update($data);
        return response()->json($recepcionesCompra);
    }

    public function destroy(RecepcionCompra $recepcionesCompra)
    {
        if ($recepcionesCompra->stock_aplicado) {
            return response()->json([
                'message' => 'Esta recepción ingresó stock. Deshazla primero para revertirlo.',
            ], 422);
        }

        $recepcionesCompra->detalles()->delete();
        $recepcionesCompra->delete();
        return response()->json(['message' => 'Eliminado']);
    }

    /** Ajusta el estado de la recepción y de la compra según lo que falte. */
    private function refrescarEstados(RecepcionCompra $recepcion, Compra $compra): void
    {
        $compra = $compra->fresh('detalles');
        $faltante = array_sum($compra->pendientePorLinea());
        $pedido = (float) $compra->detalles->sum('cantidad');

        if ($recepcion->activo) {
            $recepcion->update(['estado' => $faltante > 0 ? 'parcial' : 'completa']);
        }

        // Una compra finalizada conserva su estado: ya se cerró a mano.
        if ($compra->finalizado) {
            return;
        }

        // Sin nada recibido vuelve a "registrada"; es el caso de deshacer todo.
        $compra->update(['estado' => match (true) {
            $faltante <= 0 => 'recepcionada',
            abs($faltante - $pedido) < 0.001 => 'registrada',
            default => 'parcial',
        }]);
    }

    /** Correlativo formal del documento, ej. RC01-0024. */
    private function siguienteNumero(): string
    {
        $serieDoc = SerieDocumento::where('tipo_documento', 'recepcion_almacen')
            ->where('serie', RecepcionCompra::SERIE)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'recepcion_almacen', 'serie' => RecepcionCompra::SERIE],
                ['numero_actual' => 0, 'activo' => true]
            );

        $serieDoc->increment('numero_actual');

        return str_pad($serieDoc->numero_actual, 4, '0', STR_PAD_LEFT);
    }
}
