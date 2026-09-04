<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Compra tal como la consume el frontend.
 *
 * Sin envoltura `data`: la pantalla de edición lee la respuesta directamente
 * (compra.numero_compra, compra.detalles…), así que envolverla la rompería.
 */
class CompraResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'correlativo' => $this->correlativo,
            // Correlativo interno ya formateado: "C001-00000001".
            'numero_compra' => $this->numero_compra,
            'proveedor_id' => $this->proveedor_id,
            'orden_compra_id' => $this->orden_compra_id,

            // Documento del proveedor (factura/boleta), distinto del correlativo interno.
            'tipo_documento' => $this->tipo_documento,
            'serie' => $this->serie,
            'numero' => $this->numero,
            'guia' => $this->guia,

            'fecha' => $this->fecha,
            'forma_pago' => $this->forma_pago,
            'dias_credito' => $this->dias_credito,
            'fecha_vencimiento' => $this->fecha_vencimiento,

            'flete' => $this->flete,
            'subtotal' => $this->subtotal,
            'total' => $this->total,

            'estado' => $this->estado,
            'finalizado' => $this->finalizado,
            'motivo_finalizacion' => $this->motivo_finalizacion,
            'fecha_finalizacion' => $this->fecha_finalizacion,
            'observaciones' => $this->observaciones,
            'usuario_id' => $this->usuario_id,

            'proveedor' => $this->whenLoaded('proveedor'),
            'orden_compra' => $this->whenLoaded('ordenCompra'),
            'detalles' => CompraDetalleResource::collection($this->whenLoaded('detalles')),
            'pagos' => CompraPagoResource::collection($this->whenLoaded('pagos')),
            'detalles_count' => $this->whenCounted('detalles'),

            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
