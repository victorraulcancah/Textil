<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SubMarcaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'marca_id' => $this->marca_id,
            'nombre' => $this->nombre,
            'activo' => $this->activo,
            'created_at' => $this->created_at,
        ];
    }
}
