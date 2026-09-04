<?php

namespace App\Http\Requests\Compra;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Igual que al crear, pero los campos de cabecera son opcionales: se puede
 * enviar solo lo que cambió. Si vienen `detalles` o `pagos`, se reemplazan
 * completos, así que ahí sí se exigen todos sus campos.
 */
class UpdateCompraRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'proveedor_id' => 'nullable|exists:proveedores,id',
            'orden_compra_id' => 'nullable|exists:ordenes_compra,id',
            'tipo_documento' => 'sometimes|required|string|max:30',
            'serie' => 'nullable|string|max:20',
            'numero' => 'nullable|string|max:30',
            'guia' => 'nullable|string|max:30',
            'fecha' => 'sometimes|required|date',
            'forma_pago' => 'sometimes|required|in:contado,credito',
            'dias_credito' => 'nullable|integer|min:0',
            'fecha_vencimiento' => 'nullable|date',
            'flete' => 'nullable|numeric|min:0',
            'observaciones' => 'nullable|string',

            'detalles' => 'sometimes|required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.cantidad' => 'required|numeric|min:0.01',
            'detalles.*.costo_unitario' => 'required|numeric|min:0',

            'pagos' => 'nullable|array',
            'pagos.*.metodo' => 'required_with:pagos|in:efectivo,transferencia,billetera',
            'pagos.*.cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'pagos.*.billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'pagos.*.monto' => 'required_with:pagos|numeric|min:0',
        ];
    }

    public function messages(): array
    {
        return (new StoreCompraRequest)->messages();
    }
}
