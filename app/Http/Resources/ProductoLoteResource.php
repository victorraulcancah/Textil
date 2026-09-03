<?php
namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductoLoteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'producto_id' => $this->producto_id,
            'numero_lote' => $this->numero_lote,
            'fecha_vencimiento' => $this->fecha_vencimiento?->toDateString(),
            'stock_inicial' => $this->stock_inicial,
            'created_at' => $this->created_at,
        ];
    }
}
