<?php

namespace App\Http\Requests\OrdenVenta;

use Illuminate\Foundation\Http\FormRequest;

/** Anular un pedido: los rollos vuelven a estar disponibles. */
class AnularOrdenVentaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'motivo' => 'required|string|min:3|max:500',
        ];
    }
}
