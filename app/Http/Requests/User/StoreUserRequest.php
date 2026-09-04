<?php

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'dni' => 'nullable|digits:8',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:6',
            'empresa_id' => 'nullable|exists:empresas,id',
            'caja_id' => 'nullable|exists:cajas,id',
            'role' => 'nullable|string|exists:roles,name',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'El nombre es obligatorio',
            'dni.digits' => 'El DNI debe tener 8 dígitos',
            'email.required' => 'El correo es obligatorio',
            'email.email' => 'El correo no es válido',
            'email.unique' => 'El correo ya está registrado',
            'password.required' => 'La contraseña es obligatoria',
            'password.min' => 'La contraseña debe tener al menos 6 caracteres',
            'role.exists' => 'El rol no existe',
        ];
    }
}
