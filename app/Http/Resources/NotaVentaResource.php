<?php
namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NotaVentaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'serie' => $this->serie,
            'numero' => $this->numero,
            'cliente_id' => $this->cliente_id,
            'almacen_id' => $this->almacen_id,
            'vendedor_id' => $this->vendedor_id,
            'fecha_emision' => $this->fecha_emision,
            'moneda' => $this->moneda,
            'tipo_pago' => $this->tipo_pago,
            'subtotal' => $this->subtotal,
            'descuento_total' => $this->descuento_total,
            'total' => $this->total,
            'estado' => $this->estado,
            'motivo_anulacion' => $this->motivo_anulacion,
            'usuario_anula_id' => $this->usuario_anula_id,
            'fecha_anulacion' => $this->fecha_anulacion,
            'observaciones' => $this->observaciones,
            'cliente' => $this->whenLoaded('cliente'),
            'almacen' => $this->whenLoaded('almacen'),
            'vendedor' => UserResource::make($this->whenLoaded('vendedor')),
            'detalles' => NotaVentaDetalleResource::collection($this->whenLoaded('detalles')),
            'pagos' => NotaVentaPagoResource::collection($this->whenLoaded('pagos')),
            'usuario_anula' => UserResource::make($this->whenLoaded('usuarioAnula')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
