<?php

namespace App\Http\Resources;

use App\Models\Rollo;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Un rollo tal como lo consume el frontend y la consulta por QR.
 *
 * Sin envoltura `data`: las pantallas leen la respuesta directamente.
 */
class RolloResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'codigo' => $this->codigo,
            'codigo_proveedor' => $this->codigo_proveedor,
            'numero' => $this->numero,

            'producto_id' => $this->producto_id,
            'producto' => $this->whenLoaded('producto', fn () => [
                'id' => $this->producto->id,
                'codigo' => $this->producto->codigo,
                'nombre' => $this->producto->nombre,
            ]),

            'producto_color_id' => $this->producto_color_id,
            'color' => $this->whenLoaded('color', fn () => $this->color ? [
                'id' => $this->color->id,
                'nombre' => $this->color->nombre,
                'codigo' => $this->color->codigo,
                'hex' => $this->color->hex,
            ] : null),

            'almacen_id' => $this->almacen_id,
            'almacen' => $this->whenLoaded('almacen', fn () => $this->almacen?->nombre),

            'metros_inicial' => (float) $this->metros_inicial,
            'metros_actual' => (float) $this->metros_actual,
            'peso_kg' => $this->peso_kg !== null ? (float) $this->peso_kg : null,
            'costo_unitario' => (float) $this->costo_unitario,
            'valor' => round((float) $this->metros_actual * (float) $this->costo_unitario, 2),

            'estado' => $this->estado,
            'estado_label' => Rollo::ESTADOS[$this->estado] ?? $this->estado,

            'pasillo' => $this->pasillo,
            'rack' => $this->rack,
            'nivel' => $this->nivel,
            'posicion' => $this->posicion,
            'ubicacion' => $this->ubicacionLegible(),

            'recepcion_compra_id' => $this->recepcion_compra_id,
            'cliente_id' => $this->cliente_id,
            'cliente' => $this->whenLoaded('cliente', fn () => $this->cliente?->nombre),

            'observaciones' => $this->observaciones,

            'movimientos' => RolloMovimientoResource::collection($this->whenLoaded('movimientos')),

            'created_at' => $this->created_at,
        ];
    }
}
