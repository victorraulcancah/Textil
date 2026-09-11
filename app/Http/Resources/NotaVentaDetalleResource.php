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
            // De qué rollo salió la tela; null en lo que no va por rollos.
            'rollo_id' => $this->rollo_id,
            'rollo' => $this->whenLoaded('rollo', fn () => $this->rollo ? [
                'id' => $this->rollo->id,
                'codigo' => $this->rollo->codigo,
                'color' => $this->rollo->relationLoaded('color') ? $this->rollo->color?->nombre : null,
            ] : null),
            'cantidad' => $this->cantidad,
            'precio_unitario' => $this->precio_unitario,
            'descuento' => $this->descuento,
            'subtotal' => $this->subtotal,
            'producto_nombre' => $this->presentacion?->producto?->nombre,
            'presentacion' => ProductoPresentacionResource::make($this->whenLoaded('presentacion')),
        ];
    }
}
