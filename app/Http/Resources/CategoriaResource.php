<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CategoriaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'categoria_padre_id' => $this->categoria_padre_id,
            'nombre' => $this->nombre,
            'nivel' => $this->nivel,
            'activo' => $this->activo,
            'padre' => new CategoriaResource($this->whenLoaded('padre')),
            'hijos' => CategoriaResource::collection($this->whenLoaded('hijos')),
            'created_at' => $this->created_at,
        ];
    }
}
