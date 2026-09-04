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
            'cuenta_bancaria' => $this->whenLoaded('cuentaBancaria'),
            'billetera' => $this->whenLoaded('billetera'),
            'created_at' => $this->created_at,
        ];
    }
}
