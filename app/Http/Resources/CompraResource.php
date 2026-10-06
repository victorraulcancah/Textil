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
            // Correlativo interno ya formateado: "C001-001".
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

            'es_importacion' => (bool) $this->es_importacion,
            'numero_importacion' => $this->numero_importacion,
            'contenedor' => $this->contenedor,
            'precinto' => $this->precinto,
            'bl' => $this->bl,
            'pais_origen' => $this->pais_origen,
            'pais_destino' => $this->pais_destino,
            'puerto_embarque' => $this->puerto_embarque,
            'puerto_destino' => $this->puerto_destino,
            'cargo_type' => $this->cargo_type,
            'medio_transporte' => $this->medio_transporte,
            'incoterm' => $this->incoterm,
            'fecha_llegada' => $this->fecha_llegada,
            'fecha_embarque_estimada' => $this->fecha_embarque_estimada,
            'elaborado_por' => $this->elaborado_por,
            'aprobado_por' => $this->aprobado_por,
            'moneda_origen' => $this->moneda_origen,
            'tipo_cambio' => $this->tipo_cambio,
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
            // El número de contrato de la orden de la que salió la compra (el mismo que lleva su PDF: HLS-001-26).
            'numero_contrato' => $this->whenLoaded('ordenCompra', fn () => $this->ordenCompra?->codigoDocumento()),
            'detalles' => CompraDetalleResource::collection($this->whenLoaded('detalles')),
            'pagos' => CompraPagoResource::collection($this->whenLoaded('pagos')),
            'gastos' => $this->whenLoaded('gastos'),
            // Lo que los gastos suman al costo de la mercadería, en la moneda de la compra.
            'gastos_costo' => $this->whenLoaded('gastos', fn () => round((float) $this->gastos->where('incluye_costo', true)->sum('monto'), 2)),
            'detalles_count' => $this->whenCounted('detalles'),

            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
