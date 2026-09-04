<?php

namespace App\Http\Requests\Empresa;

use Illuminate\Foundation\Http\FormRequest;

class StoreEmpresaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'ruc' => 'required|string|size:11|unique:empresas,ruc',
            'razon_social' => 'required|string|max:255',
            'nombre_comercial' => 'required|string|max:255',
            'direccion' => 'nullable|string|max:500',
            'departamento' => 'nullable|string|max:100',
            'provincia' => 'nullable|string|max:100',
            'distrito' => 'nullable|string|max:100',
            'ciudad' => 'nullable|string|max:100',
            'telefono' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
            'web' => 'nullable|url|max:255',
            'activa' => 'sometimes|boolean',
            // Solo PNG/JPG: dompdf (los PDF) no renderiza SVG ni WebP de forma confiable.
            'logo' => 'nullable|image|mimes:png,jpg,jpeg|max:4096',
        ];
    }

    public function messages(): array
    {
        return [
            'ruc.required' => 'El RUC es obligatorio',
            'ruc.size' => 'El RUC debe tener 11 dígitos',
            'ruc.unique' => 'El RUC ya está registrado',
            'razon_social.required' => 'La razón social es obligatoria',
            'nombre_comercial.required' => 'El nombre comercial es obligatorio',
        ];
    }
}
