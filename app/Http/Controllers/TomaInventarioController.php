<?php

namespace App\Http\Controllers;

use App\Models\Almacen;
use App\Models\ProductoAlmacenStock;
use App\Models\ProductoPresentacion;
use App\Models\TomaInventario;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TomaInventarioController extends Controller
{
    public function index()
    {
        return response()->json(
            TomaInventario::with('almacen')->withCount('detalles')->latest('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'almacen_id' => 'required|exists:almacenes,id',
            'observaciones' => 'nullable|string',
            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.stock_contado' => 'required|numeric|min:0',
        ]);

        $toma = DB::transaction(function () use ($data) {
            $toma = TomaInventario::create([
                'almacen_id' => $data['almacen_id'],
                'observaciones' => $data['observaciones'] ?? null,
                'estado' => 'en_proceso',
                'fecha' => now(),
                'usuario_id' => auth()->id(),
            ]);

            foreach ($data['detalles'] as $detalle) {
                $presentacion = ProductoPresentacion::findOrFail($detalle['producto_presentacion_id']);
                $sistema = (float) (ProductoAlmacenStock::where('producto_id', $presentacion->producto_id)
                    ->where('almacen_id', $data['almacen_id'])
                    ->value('stock_actual') ?? 0);
                $contado = (float) $detalle['stock_contado'];

                $toma->detalles()->create([
                    'producto_presentacion_id' => $presentacion->id,
                    'stock_sistema' => $sistema,
                    'stock_contado' => $contado,
                    'diferencia' => $contado - $sistema,
                ]);
            }

            return $toma;
        });

        return response()->json($toma->load(['almacen', 'detalles.presentacion.producto']), 201);
    }

    public function show(TomaInventario $tomasInventario)
    {
        return response()->json($tomasInventario->load(['almacen', 'detalles.presentacion.producto']));
    }

    public function update(Request $request, TomaInventario $tomasInventario)
    {
        // El formulario también manda el estado; sin esta regla se descartaba.
        $data = $request->validate([
            'estado' => 'nullable|in:en_proceso,cerrado',
            'observaciones' => 'nullable|string',
        ]);
        $tomasInventario->update($data);
        return response()->json($tomasInventario);
    }

    public function destroy(TomaInventario $tomasInventario)
    {
        $tomasInventario->delete();
        return response()->json(['message' => 'Eliminado']);
    }

    /** Cierra la toma y aplica al stock la diferencia contada de cada línea. */
    public function cerrar(TomaInventario $toma)
    {
        if ($toma->estado !== 'en_proceso') {
            return response()->json(['message' => 'La toma ya está cerrada.'], 422);
        }

        try {
            DB::transaction(function () use ($toma) {
                $toma->load(['detalles.presentacion', 'almacen']);
                $almacen = Almacen::findOrFail($toma->almacen_id);
                $stock = app(StockService::class);

                foreach ($toma->detalles as $detalle) {
                    $diff = (float) $detalle->diferencia;
                    if ($diff == 0.0 || ! $detalle->presentacion) {
                        continue;
                    }
                    $factor = (float) $detalle->presentacion->factor_conversion ?: 1;
                    $cant = ($factor > 0 ? abs($diff) / $factor : abs($diff));
                    $args = [$detalle->presentacion, $almacen, $cant, 0, 'toma_inventario', 'toma_inventario', $toma->id, auth()->id()];
                    $diff > 0 ? $stock->entrada(...$args) : $stock->salida(...$args);
                }

                $toma->update(['estado' => 'cerrado']);
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($toma->fresh());
    }
}
