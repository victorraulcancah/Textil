<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Una línea del pedido: lo que se pidió y con qué rollos se está cubriendo.
 */
class OrdenVentaDetalleResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'producto_presentacion_id' => $this->producto_presentacion_id,
            // Siempre con la forma de closure: `whenLoaded` devuelve un objeto
            // MissingValue que es "truthy", así que un ternario no lo filtra.
            'presentacion' => $this->whenLoaded('presentacion', fn () => $this->presentacion?->nombre),
            'producto' => $this->whenLoaded('presentacion', fn () => $this->presentacion?->producto?->nombre),
            'producto_codigo' => $this->whenLoaded('presentacion', fn () => $this->presentacion?->producto?->codigo),

            // Color pedido; null si esta línea no se pide por color.
            'producto_color_id' => $this->producto_color_id,
            'color' => $this->whenLoaded('color', fn () => $this->color ? [
                'id' => $this->color->id,
                'nombre' => $this->color->nombre,
                'codigo' => $this->color->codigo,
                'hex' => $this->color->hex,
            ] : null),

            'cantidad' => (float) $this->cantidad,
            'descripcion' => $this->descripcion,
            'metros' => (float) $this->metros,

            'cantidad_reservada' => $this->cantidad_reservada !== null ? (float) $this->cantidad_reservada : null,
            'almacen_reserva' => $this->whenLoaded('almacenReserva', fn () => $this->almacenReserva?->nombre),
            'precio_unitario' => (float) $this->precio_unitario,
            'descuento' => (float) $this->descuento,
            'subtotal' => (float) $this->subtotal,

            // Cuánto lleva cubierto el almacén de esta línea.
            'metros_asignados' => $this->whenLoaded('rollos', fn () => $this->metrosAsignados()),
            'metros_pendientes' => $this->whenLoaded('rollos', fn () => $this->metrosPendientes()),
            'cubierta' => $this->whenLoaded('rollos', fn () => $this->estaCubierta()),

            'rollos' => $this->whenLoaded('rollos', fn () => $this->rollos->map(fn ($r) => [
                'id' => $r->id,
                'rollo_id' => $r->rollo_id,
                'codigo' => $r->rollo?->codigo,
                'color' => $r->rollo?->color?->nombre,
                'metros' => (float) $r->metros,
                'metros_rollo' => (float) ($r->rollo?->metros_actual ?? 0),
                'es_parcial' => $r->esParcial(),
                'escaneado_at' => $r->escaneado_at,
                // Quién lo escaneó: varios almaceneros pueden preparar el
                // mismo pedido y hace falta saber quién trajo cuál rollo.
                'escaneado_por' => $r->usuario?->name,
            ])->values()),
        ];
    }
}
