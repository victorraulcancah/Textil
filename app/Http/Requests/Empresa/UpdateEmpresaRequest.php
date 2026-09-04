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
            'web' => 'nullable|url|max:255',
            'activa' => 'sometimes|boolean',
            // Por extensión y no con la regla `image`: PHP no siempre detecta el
            // MIME de un SVG. En los PDF (dompdf) solo se usan PNG/JPG; con SVG
            // el documento muestra el nombre comercial como marca.
            'logo' => 'nullable|file|extensions:png,jpg,jpeg,svg|max:4096',
        ];
    }

    public function messages(): array
    {
        return [
            'logo.file' => 'El logo debe ser un archivo',
            'logo.extensions' => 'El logo debe ser PNG, JPG o SVG',
            'logo.max' => 'El logo no debe superar 4 MB',
            'ruc.size' => 'El RUC debe tener 11 dígitos',
            'ruc.unique' => 'El RUC ya está registrado',
        ];
    }
}
