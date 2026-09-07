<?php

namespace App\Http\Requests\Rollo;

use Illuminate\Foundation\Http\FormRequest;

/** Mover un rollo de rack, o de almacén. */
class TrasladarRolloRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'almacen_id' => 'nullable|exists:almacenes,id',
            'pasillo' => 'nullable|string|max:20',
            'rack' => 'nullable|string|max:20',
            'nivel' => 'nullable|string|max:20',
            'posicion' => 'nullable|string|max:20',
        ];
    }
}
