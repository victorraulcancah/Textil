<?php

namespace App\Http\Requests\Compra;

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
            'observaciones' => 'nullable|string',

            'detalles' => 'required|array|min:1',
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
