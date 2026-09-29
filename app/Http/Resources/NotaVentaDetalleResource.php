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
                'color_codigo' => $this->rollo->relationLoaded('color') ? $this->rollo->color?->codigo : null,
            ] : null),
            // Lo que medía el rollo al venderlo (el "factor") y si salió entero o fue un corte.
            'metros_rollo' => $this->metros_rollo !== null ? (float) $this->metros_rollo : null,
            'rollo_entero' => (bool) $this->rollo_entero,
            'cantidad' => $this->cantidad,
            'precio_unitario' => $this->precio_unitario,
            'descuento' => $this->descuento,
            'subtotal' => $this->subtotal,
            // La fila como se lee en la proforma (color, cantidad en m, U., precio).
            'proforma' => $this->presentacion ? $this->filaProforma() : null,
            'producto_id' => $this->presentacion?->producto_id,
            'producto_nombre' => $this->presentacion?->producto?->nombre,
            'producto_codigo' => $this->presentacion?->producto?->codigo,
            'presentacion' => ProductoPresentacionResource::make($this->whenLoaded('presentacion')),
        ];
    }
}
