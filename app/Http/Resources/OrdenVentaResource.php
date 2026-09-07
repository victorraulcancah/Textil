<?php

namespace App\Http\Resources;

use App\Models\OrdenVenta;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * El pedido tal como lo consume el frontend.
 *
 * Lleva los contadores de verificación para que la pantalla de despacho sepa
 * cuántos rollos faltan escanear sin tener que recorrer el detalle.
 */
class OrdenVentaResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        $detalles = $this->whenLoaded('detalles');

        return [
            'id' => $this->id,
            'serie' => $this->serie,
            'numero' => $this->numero,
            'documento' => $this->documento,

            'cliente_id' => $this->cliente_id,
            'cliente' => $this->whenLoaded('cliente', fn () => $this->cliente?->nombre),

            'almacen_id' => $this->almacen_id,
            'almacen' => $this->whenLoaded('almacen', fn () => $this->almacen?->nombre),

            'vendedor_id' => $this->vendedor_id,
            'vendedor' => $this->whenLoaded('vendedor', fn () => $this->vendedor?->name),

            'fecha_emision' => $this->fecha_emision?->toDateString(),
            'fecha_entrega' => $this->fecha_entrega?->toDateString(),

            'estado' => $this->estado,
            'estado_label' => OrdenVenta::ESTADOS[$this->estado] ?? $this->estado,
            'transiciones' => OrdenVenta::TRANSICIONES[$this->estado] ?? [],
            'editable' => $this->esEditable(),

            'moneda' => $this->moneda,
            'subtotal' => (float) $this->subtotal,
            'descuento_total' => (float) $this->descuento_total,
            'total' => (float) $this->total,

            'requerimiento_numero' => $this->requerimiento_numero,

            'fecha_separacion' => $this->fecha_separacion,
            'fecha_preparacion' => $this->fecha_preparacion,
            'fecha_despacho' => $this->fecha_despacho,

            'usuario_prepara' => $this->whenLoaded('usuarioPrepara', fn () => $this->usuarioPrepara?->name),
            'usuario_despacha' => $this->whenLoaded('usuarioDespacha', fn () => $this->usuarioDespacha?->name),

            'motivo_anulacion' => $this->motivo_anulacion,
            'fecha_anulacion' => $this->fecha_anulacion,
            'observaciones' => $this->observaciones,

            // Resumen: lo que se ve en el listado sin abrir el pedido.
            'total_rollos' => $this->when(isset($this->detalles_count), $this->detalles_count),
            'total_metros' => $this->whenLoaded('detalles', fn () => round($this->detalles->sum('metros'), 2)),
            'verificados' => $this->whenLoaded('detalles', fn () => $this->detalles->whereNotNull('escaneado_at')->count()),

            'detalles' => OrdenVentaRolloResource::collection($detalles),

            'nota_venta_id' => $this->whenLoaded('notaVenta', fn () => $this->notaVenta?->id),

            'created_at' => $this->created_at,
        ];
    }
}
