<?php

namespace App\Http\Requests\OrdenVenta;

use Illuminate\Foundation\Http\FormRequest;

/**
 * El escaneo del almacenero. Llega el código que leyó la pistola; si el rollo
 * no corresponde al pedido lo dice el servicio, no la validación, porque ese
 * caso no es un error del usuario sino un aviso operativo.
 */
class EscanearRolloRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'codigo' => 'required|string|max:100',
        ];
    }
}
