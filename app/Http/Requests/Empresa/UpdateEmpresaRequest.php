<?php

namespace App\Http\Requests\Empresa;

use Illuminate\Foundation\Http\FormRequest;

class UpdateEmpresaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'ruc' => 'sometimes|string|size:11|unique:empresas,ruc,' . $this->route('empresa'),
            'razon_social' => 'sometimes|string|max:255',
            'nombre_comercial' => 'sometimes|string|max:255',
            'direccion' => 'nullable|string|max:500',
            'departamento' => 'nullable|string|max:100',
            'provincia' => 'nullable|string|max:100',
            'distrito' => 'nullable|string|max:100',
            'ciudad' => 'nullable|string|max:100',
            'telefono' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
            'activa' => 'sometimes|boolean',
        ];
    }

    public function messages(): array
    {
        return [
            'ruc.size' => 'El RUC debe tener 11 dígitos',
            'ruc.unique' => 'El RUC ya está registrado',
        ];
    }
}
