<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompraDetalleResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'compra_id' => $this->compra_id,
            'producto_presentacion_id' => $this->producto_presentacion_id,
            'cantidad' => $this->cantidad,
            'costo_unitario' => $this->costo_unitario,
            'subtotal' => $this->subtotal,

            // Cuánto se cerró sin recibir (compra finalizada con faltantes).
            'cantidad_finalizada' => $this->cantidad_finalizada,

            // Las calcula el listado a partir de las recepciones vigentes; en
            // las demás respuestas no vienen.
            'recibido' => $this->when(isset($this->recibido), fn () => $this->recibido),
            'pendiente' => $this->when(isset($this->pendiente), fn () => $this->pendiente),

            'presentacion' => $this->whenLoaded('presentacion'),

            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
