<?php

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:255',
            'dni' => 'nullable|digits:8',
            // La ruta declara {id}: con route('user') venía null y el unique no
            // ignoraba al propio usuario, así que guardar sin tocar el correo
            // fallaba con "El correo ya está registrado".
            'email' => 'sometimes|email|max:255|unique:users,email,' . $this->route('id'),
            // Sin `confirmed`: el formulario tiene un solo campo de contraseña,
            // igual que al crear. Exigir la confirmación hacía fallar toda edición.
            'password' => 'sometimes|string|min:6',
            'empresa_id' => 'nullable|exists:empresas,id',
            'caja_id' => 'nullable|exists:cajas,id',
            'role' => 'sometimes|string|exists:roles,name',
        ];
    }

    public function messages(): array
    {
        return [
            'name.max' => 'El nombre no puede exceder 255 caracteres',
            'dni.digits' => 'El DNI debe tener 8 dígitos',
            'email.email' => 'El correo no es válido',
            'email.unique' => 'El correo ya está registrado',
            'password.min' => 'La contraseña debe tener al menos 6 caracteres',
            'empresa_id.exists' => 'La empresa no existe',
            'role.exists' => 'El rol no existe',
        ];
    }
}
