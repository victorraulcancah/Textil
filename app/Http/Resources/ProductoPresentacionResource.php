<?php
namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductoPresentacionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'producto_id' => $this->producto_id,
            'nombre' => $this->nombre,
            'codigo_barras' => $this->codigo_barras,
            'precio_venta' => $this->precio_venta,
            'precio_compra' => $this->precio_compra,
            'margen' => $this->margen,
            'factor_conversion' => $this->factor_conversion,
            // Unidad en la que se vende esta presentación (Metro, Rollo…).
            // El id va suelto porque la venta filtra con él según el almacén.
            'unidad_base_id' => $this->unidad_base_id,
            'unidad_base' => new UnidadMedidaResource($this->whenLoaded('unidadBase')),
            // Solo si quien consulta lo cargó (ventas y compras lo necesitan
            // para mostrar código y marca); si no, ni se serializa.
            'producto' => new ProductoResource($this->whenLoaded('producto')),
            'producto_complementario_id' => $this->producto_complementario_id,
            'complementario' => new ProductoResource($this->whenLoaded('complementario')),
            'cantidad_complementaria' => $this->cantidad_complementaria,
            // La lista de precios (otros tipos y precios por cantidad). El
            // principal "desde 1" es `precio_venta`.
            // Solo los de tipos activos: un tipo desactivado ya no se ofrece.
            'precios' => $this->whenLoaded('precios', fn () => $this->precios->filter(fn ($p) => $p->tipoPrecio?->activo !== false)->map(fn ($p) => [
                'id' => $p->id,
                'tipo_precio_id' => $p->tipo_precio_id,
                'principal' => (bool) $p->tipoPrecio?->principal,
                'desde' => (float) $p->desde,
                'precio' => (float) $p->precio,
                'margen' => $p->margen !== null ? (float) $p->margen : null,
            ])->values()),
            'activo' => $this->activo,
            'created_at' => $this->created_at,
        ];
    }
}
