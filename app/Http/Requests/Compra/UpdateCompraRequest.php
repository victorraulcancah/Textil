<?php

namespace App\Http\Requests\Compra;

use Illuminate\Contracts\Validation\Validator;
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

            'es_importacion' => 'nullable|boolean',
            'numero_importacion' => 'nullable|string|max:40',
            'contenedor' => 'nullable|string|max:40',
            'precinto' => 'nullable|string|max:40',
            'bl' => 'nullable|string|max:60',
            'pais_origen' => 'nullable|string|max:60',
            'pais_destino' => 'nullable|string|max:100',
            'puerto_embarque' => 'nullable|string|max:100',
            'puerto_destino' => 'nullable|string|max:100',
            'cargo_type' => 'nullable|string|max:30',
            'medio_transporte' => 'nullable|string|max:30',
            'incoterm' => 'nullable|string|max:10',
            'fecha_llegada' => 'nullable|date',
            'fecha_embarque_estimada' => 'nullable|date',
            'elaborado_por' => 'nullable|string|max:100',
            'aprobado_por' => 'nullable|string|max:100',
            'moneda_origen' => 'nullable|in:PEN,USD,CNY,EUR',
            'tipo_cambio' => 'nullable|numeric|min:0.0001',
            'observaciones' => 'nullable|string',

            'detalles' => 'sometimes|required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.producto_color_id' => 'nullable|exists:producto_colores,id',
            'detalles.*.rollos' => 'nullable|integer|min:0',
            'detalles.*.cantidad' => 'required|numeric|min:0.01',
            'detalles.*.costo_unitario' => 'required|numeric|min:0',

            'pagos' => 'nullable|array',
            'pagos.*.metodo' => 'required_with:pagos|in:efectivo,transferencia,billetera',
            'pagos.*.cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'pagos.*.billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'pagos.*.monto' => 'required_with:pagos|numeric|min:0',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $moneda = $this->input('moneda_origen');
            if ($moneda && $moneda !== 'PEN' && ! $this->filled('tipo_cambio')) {
                $v->errors()->add('tipo_cambio', 'Con la compra en otra moneda, el tipo de cambio es obligatorio.');
            }
        });
    }

    public function messages(): array
    {
        return (new StoreCompraRequest)->messages();
    }
}
