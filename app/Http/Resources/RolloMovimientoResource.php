<?php

namespace App\Http\Resources;

use App\Models\Rollo;
use App\Models\RolloMovimiento;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Una línea del historial del rollo. */
class RolloMovimientoResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tipo' => $this->tipo,
            'tipo_label' => RolloMovimiento::TIPOS[$this->tipo] ?? $this->tipo,

            'metros' => (float) $this->metros,
            'metros_antes' => (float) $this->metros_antes,
            'metros_despues' => (float) $this->metros_despues,

            'estado_antes' => $this->estado_antes,
            'estado_antes_label' => $this->estado_antes ? (Rollo::ESTADOS[$this->estado_antes] ?? $this->estado_antes) : null,
            'estado_despues' => $this->estado_despues,
            'estado_despues_label' => $this->estado_despues ? (Rollo::ESTADOS[$this->estado_despues] ?? $this->estado_despues) : null,

            'documento_tipo' => $this->documento_tipo,
            'documento_id' => $this->documento_id,

            'usuario' => $this->whenLoaded('usuario', fn () => $this->usuario?->name),
            'observacion' => $this->observacion,

            'created_at' => $this->created_at,
        ];
    }
}
