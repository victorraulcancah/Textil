<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Una línea del pedido: el rollo y los metros que se llevan de él. */
class OrdenVentaRolloResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        $rollo = $this->whenLoaded('rollo');

        return [
            'id' => $this->id,
            'rollo_id' => $this->rollo_id,
            'rollo' => $rollo ? new RolloResource($rollo) : null,

            'producto_presentacion_id' => $this->producto_presentacion_id,
            'presentacion' => $this->whenLoaded('presentacion', fn () => $this->presentacion?->nombre),

            'metros' => (float) $this->metros,
            'precio_unitario' => (float) $this->precio_unitario,
            'descuento' => (float) $this->descuento,
            'subtotal' => (float) $this->subtotal,

            // Se lleva solo un pedazo del rollo: hay que cortar.
            'es_parcial' => $this->whenLoaded('rollo', fn () => $this->esParcial()),

            'escaneado_at' => $this->escaneado_at,
            'escaneado' => (bool) $this->escaneado_at,
        ];
    }
}
