<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompraPagoResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'compra_id' => $this->compra_id,
            'metodo' => $this->metodo,
            'cuenta_bancaria_id' => $this->cuenta_bancaria_id,
            'billetera_id' => $this->billetera_id,
            'monto' => $this->monto,
            'moneda' => $this->moneda,
            // Si salió en soles: cuánto y a qué tipo de cambio (`monto` es lo
            // que abonó a la compra, en su moneda).
            'monto_pen' => $this->monto_pen,
            'tipo_cambio' => $this->tipo_cambio,
            'cuenta_bancaria' => $this->whenLoaded('cuentaBancaria'),
            'billetera' => $this->whenLoaded('billetera'),
            'created_at' => $this->created_at,
        ];
    }
}
