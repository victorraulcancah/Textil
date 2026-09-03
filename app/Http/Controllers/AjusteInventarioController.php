<?php

namespace App\Http\Controllers;

use App\Models\AjusteInventario;
use App\Models\Almacen;
use App\Models\ProductoAlmacenStock;
use App\Models\ProductoPresentacion;
use App\Models\SerieDocumento;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

//
class AjusteInventarioController extends Controller
{
    private const RELACIONES = [
        'almacen:id,nombre',
        'proveedor:id,nombre',
        'usuarioSolicita:id,name',
        'detalles.presentacion.producto.marca',
        'detalles.presentacion.producto.unidadMedida',
    ];

    public function index()
    {
        return response()->json(
            AjusteInventario::with(self::RELACIONES)->withCount('detalles')->latest('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'almacen_id' => 'required|exists:almacenes,id',
            'proveedor_id' => 'nullable|exists:proveedores,id',
            'tipo' => 'required|in:entrada,salida',
            'motivo' => 'required|string',
            'observaciones' => 'nullable|string',
            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.cantidad' => 'required|numeric|min:0.01',
        ]);

        try {
            $ajuste = DB::transaction(function () use ($data) {
                $ajuste = AjusteInventario::create([
                    'serie' => AjusteInventario::SERIE,
                    'numero' => $this->siguienteNumero(),
                    'almacen_id' => $data['almacen_id'],
                    'proveedor_id' => $data['proveedor_id'] ?? null,
                    'tipo' => $data['tipo'],
                    'motivo' => $data['motivo'],
                    'observaciones' => $data['observaciones'] ?? null,
                    'estado' => 'aprobado',
                    'usuario_solicita_id' => auth()->id(),
                    'usuario_aprueba_id' => auth()->id(),
                    'fecha' => now(),
                ]);

                $almacen = Almacen::findOrFail($data['almacen_id']);
                $stock = app(StockService::class);
                $total = 0;

                foreach ($data['detalles'] as $detalle) {
                    $presentacion = ProductoPresentacion::findOrFail($detalle['producto_presentacion_id']);
                    $cantidad = (float) $detalle['cantidad'];

                    // Costo (no precio de venta) de una unidad de esta presentación.
                    $costo = $this->costoDe($presentacion, $almacen);
                    $subtotal = round($cantidad * $costo, 2);
                    $total += $subtotal;

                    $ajuste->detalles()->create([
                        'producto_presentacion_id' => $presentacion->id,
                        'cantidad' => $cantidad,
                        'costo_unitario' => $costo,
                        'subtotal' => $subtotal,
                    ]);

                    // "entrada" suma stock; "salida" lo resta.
                    $args = [$presentacion, $almacen, $cantidad, 0, 'ajuste_manual', 'ajuste_inventario', $ajuste->id, auth()->id()];
                    $data['tipo'] === 'salida' ? $stock->salida(...$args) : $stock->entrada(...$args);
                }

                $ajuste->update(['total' => round($total, 2)]);

                return $ajuste;
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(
            $ajuste->load(self::RELACIONES),
            201
        );
    }

    public function show(AjusteInventario $ajuste)
    {
        return response()->json($ajuste->load(self::RELACIONES));
    }

    public function update(Request $request, AjusteInventario $ajuste)
    {
        // El ajuste ya movió stock al crearse, así que solo se editan los datos
        // descriptivos. Cambiar almacén, tipo o cantidades exigiría revertir y
        // volver a aplicar: para eso se elimina y se crea de nuevo.
        $data = $request->validate([
            'estado' => 'nullable|in:pendiente,aprobado,rechazado',
            'observaciones' => 'nullable|string',
        ]);
        $ajuste->update($data);
        return response()->json($ajuste);
    }

    /**
     * Costo de una unidad de la presentación en ese almacén. Se prefiere el costo
     * promedio real del inventario; si aún no hay, el precio de compra configurado.
     */
    private function costoDe(ProductoPresentacion $presentacion, Almacen $almacen): float
    {
        $factor = (float) $presentacion->factor_conversion ?: 1;

        $promedioBase = (float) ProductoAlmacenStock::where('producto_id', $presentacion->producto_id)
            ->where('almacen_id', $almacen->id)
            ->value('costo_promedio');

        if ($promedioBase > 0) {
            return round($promedioBase * $factor, 4);
        }

        return round((float) $presentacion->precio_compra, 4);
    }

    /** Correlativo formal del ajuste, ej. AJ01-0001. */
    private function siguienteNumero(): string
    {
        $serieDoc = SerieDocumento::where('tipo_documento', 'ajuste_inventario')
            ->where('serie', AjusteInventario::SERIE)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'ajuste_inventario', 'serie' => AjusteInventario::SERIE],
                ['numero_actual' => 0, 'activo' => true]
            );

        $serieDoc->increment('numero_actual');

        return str_pad($serieDoc->numero_actual, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Eliminar revierte el stock que el ajuste movió: si no, la mercadería
     * quedaría sumada o restada sin ningún documento que lo respalde.
     */
    public function destroy(AjusteInventario $ajuste)
    {
        try {
            DB::transaction(function () use ($ajuste) {
                $ajuste->load('detalles');
                $almacen = Almacen::findOrFail($ajuste->almacen_id);
                $stock = app(StockService::class);

                foreach ($ajuste->detalles as $detalle) {
                    $presentacion = ProductoPresentacion::findOrFail($detalle->producto_presentacion_id);
                    $cantidad = (float) $detalle->cantidad;

                    // Movimiento inverso al que hizo el ajuste.
                    $args = [$presentacion, $almacen, $cantidad, 0, 'ajuste_manual', 'ajuste_inventario', $ajuste->id, auth()->id()];
                    $ajuste->tipo === 'salida' ? $stock->entrada(...$args) : $stock->salida(...$args);
                }

                $ajuste->detalles()->delete();
                $ajuste->delete();
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Eliminado']);
    }
}
