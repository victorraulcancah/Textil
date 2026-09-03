<?php
namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NotaVentaPagoResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'nota_venta_id' => $this->nota_venta_id,
            'metodo_pago_id' => $this->metodo_pago_id,
            'forma_pago' => $this->forma_pago,
            'monto' => $this->monto,
            'fecha' => $this->fecha,
            'referencia' => $this->referencia,
            'metodo_pago' => $this->whenLoaded('metodoPago'),
        ];
    }
}
