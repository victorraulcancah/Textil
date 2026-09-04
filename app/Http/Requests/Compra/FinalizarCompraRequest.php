<?php

namespace App\Http\Requests\Compra;

use Illuminate\Foundation\Http\FormRequest;

/** Cierre de lo que falta por recibir: exige dejar constancia del motivo. */
class FinalizarCompraRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'motivo' => 'required|string|max:255',
        ];
    }

    public function messages(): array
    {
        return [
            'motivo.required' => 'Indica por qué se cierra lo pendiente',
            'motivo.max' => 'El motivo no puede exceder 255 caracteres',
        ];
    }
}
