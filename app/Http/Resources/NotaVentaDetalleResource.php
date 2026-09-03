<?php
namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NotaVentaDetalleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'nota_venta_id' => $this->nota_venta_id,
            'producto_presentacion_id' => $this->producto_presentacion_id,
            'cantidad' => $this->cantidad,
            'precio_unitario' => $this->precio_unitario,
            'descuento' => $this->descuento,
            'subtotal' => $this->subtotal,
            'producto_nombre' => $this->presentacion?->producto?->nombre,
            'presentacion' => ProductoPresentacionResource::make($this->whenLoaded('presentacion')),
        ];
    }
}
