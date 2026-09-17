<?php

namespace App\Http\Requests\Compra;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class StoreCompraRequest extends FormRequest
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
            'tipo_documento' => 'required|string|max:30',
            // Serie y número son los del documento del proveedor: el correlativo
            // interno (C001-00000001) lo genera el sistema.
            'serie' => 'nullable|string|max:20',
            'numero' => 'nullable|string|max:30',
            'guia' => 'nullable|string|max:30',
            'fecha' => 'required|date',
            'forma_pago' => 'required|in:contado,credito',
            'dias_credito' => 'nullable|integer|min:0',
            'fecha_vencimiento' => 'nullable|date',
            'flete' => 'nullable|numeric|min:0',

            // Datos de la importacion: solo cuando la compra viene del exterior.
            'es_importacion' => 'nullable|boolean',
            'numero_importacion' => 'nullable|string|max:40',
            'contenedor' => 'nullable|string|max:40',
            'precinto' => 'nullable|string|max:40',
            'bl' => 'nullable|string|max:60',
            'pais_origen' => 'nullable|string|max:60',
            // Mismos campos de embarque que ya pregunta la orden de compra al
            // exterior: al convertir una en compra, se llenan solos.
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
            // Sin tipo de cambio, una compra que no sea en soles no se puede
            // llevar a soles y el costo del stock quedaría mal calculado.
            'tipo_cambio' => 'nullable|numeric|min:0.0001',
            'observaciones' => 'nullable|string',

            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            // Igual que en la orden: color opcional (hay insumos sin color) y
            // rollos, solo informativo hasta que se recepcione de verdad.
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
        return [
            'proveedor_id.exists' => 'El proveedor seleccionado no existe',
            'orden_compra_id.exists' => 'La orden de compra seleccionada no existe',
            'tipo_documento.required' => 'El tipo de documento es obligatorio',
            'fecha.required' => 'La fecha es obligatoria',
            'fecha.date' => 'La fecha no es válida',
            'forma_pago.required' => 'La forma de pago es obligatoria',
            'forma_pago.in' => 'La forma de pago debe ser contado o crédito',
            'dias_credito.min' => 'Los días de crédito no pueden ser negativos',
            'flete.min' => 'El flete no puede ser negativo',

            'detalles.required' => 'Debe agregar al menos un producto',
            'detalles.min' => 'Debe agregar al menos un producto',
            'detalles.*.producto_presentacion_id.required' => 'El producto es obligatorio en cada línea',
            'detalles.*.producto_presentacion_id.exists' => 'El producto seleccionado no existe',
            'detalles.*.cantidad.required' => 'La cantidad es obligatoria en cada línea',
            'detalles.*.cantidad.min' => 'La cantidad debe ser mayor a 0',
            'detalles.*.costo_unitario.required' => 'El costo es obligatorio en cada línea',
            'detalles.*.costo_unitario.min' => 'El costo no puede ser negativo',

            'pagos.*.metodo.required_with' => 'El método de pago es obligatorio',
            'pagos.*.metodo.in' => 'El método de pago debe ser efectivo, transferencia o billetera',
            'pagos.*.monto.required_with' => 'El monto del pago es obligatorio',
            'pagos.*.monto.min' => 'El monto del pago no puede ser negativo',
        ];
    }
}
