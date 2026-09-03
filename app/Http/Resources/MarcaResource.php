<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MarcaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'nombre' => $this->nombre,
            'logo' => $this->logo,
            'activo' => $this->activo,
            'sub_marcas' => SubMarcaResource::collection($this->whenLoaded('subMarcas')),
            'created_at' => $this->created_at,
        ];
    }
}
