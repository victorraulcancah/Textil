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
            'unidad_base' => new UnidadMedidaResource($this->whenLoaded('unidadBase')),
            // Solo si quien consulta lo cargó (ventas y compras lo necesitan
            // para mostrar código y marca); si no, ni se serializa.
            'producto' => new ProductoResource($this->whenLoaded('producto')),
            'producto_complementario_id' => $this->producto_complementario_id,
            'complementario' => new ProductoResource($this->whenLoaded('complementario')),
            'cantidad_complementaria' => $this->cantidad_complementaria,
            'activo' => $this->activo,
            'created_at' => $this->created_at,
        ];
    }
}
