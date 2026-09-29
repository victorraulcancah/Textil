<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProductoResource;
use App\Models\Producto;
use App\Models\ProductoPrecio;
use App\Models\TipoPrecio;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Guarda los precios de un producto para un tipo de precio: una fila por
 * presentación y por cantidad desde la que rige ("Metro desde 100").
 *
 * Del tipo principal, la fila "desde 1" es el `precio_venta` de la
 * presentación —el que ya usa todo el sistema—; el resto va a
 * `producto_precios`.
 */
class ListaPrecioController extends Controller
{
    public function update(Request $request, Producto $producto)
    {
        $data = $request->validate([
            'tipo_precio_id' => 'required|exists:tipos_precio,id',
            'afecto_igv' => 'sometimes|boolean',
            'filas' => 'present|array',
            'filas.*.producto_presentacion_id' => 'required|integer',
            'filas.*.desde' => 'required|numeric|min:1',
            'filas.*.precio' => 'required|numeric|min:0',
            'filas.*.margen' => 'nullable|numeric',
        ], [
            'filas.*.desde.min' => 'La cantidad "desde" es 1 o más.',
            'filas.*.precio.min' => 'El precio no puede ser negativo.',
        ]);

        $tipo = TipoPrecio::findOrFail($data['tipo_precio_id']);
        $presentaciones = $producto->presentaciones()->get()->keyBy('id');
        $filas = collect($data['filas'])->map(fn ($f) => [
            'producto_presentacion_id' => (int) $f['producto_presentacion_id'],
            'desde' => round((float) $f['desde'], 2),
            'precio' => round((float) $f['precio'], 4),
            'margen' => isset($f['margen']) ? round((float) $f['margen'], 2) : null,
        ]);

        if ($filas->contains(fn ($f) => ! $presentaciones->has($f['producto_presentacion_id']))) {
            return response()->json(['message' => 'Hay una presentación que no es de este producto.'], 422);
        }

        $repetidas = $filas->groupBy(fn ($f) => $f['producto_presentacion_id'].'|'.$f['desde'])
            ->filter(fn ($grupo) => $grupo->count() > 1);
        if ($repetidas->isNotEmpty()) {
            return response()->json(['message' => 'Hay dos precios de la misma presentación desde la misma cantidad.'], 422);
        }

        DB::transaction(function () use ($producto, $tipo, $presentaciones, $filas, $data) {
            if (array_key_exists('afecto_igv', $data)) {
                $producto->update(['afecto_igv' => (bool) $data['afecto_igv']]);
            }

            // El principal "desde 1" es el precio de la presentación misma.
            if ($tipo->principal) {
                foreach ($filas->where('desde', 1.0) as $f) {
                    $presentaciones[$f['producto_presentacion_id']]->update([
                        'precio_venta' => $f['precio'],
                        'margen' => $f['margen'] ?? 0,
                    ]);
                }
                $filas = $filas->reject(fn ($f) => $f['desde'] == 1.0);
            }

            // La lista de este tipo se reemplaza entera: lo que no vino, se quitó.
            ProductoPrecio::where('tipo_precio_id', $tipo->id)
                ->whereIn('producto_presentacion_id', $presentaciones->keys())
                ->delete();

            foreach ($filas as $f) {
                ProductoPrecio::create($f + ['tipo_precio_id' => $tipo->id]);
            }

            $producto->refrescarPrecioBase();
        });

        return ProductoResource::make($producto->fresh()->load([
            'unidadBase', 'presentaciones.unidadBase', 'presentaciones.precios.tipoPrecio:id,principal,activo',
        ]));
    }
}
