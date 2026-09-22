<?php

namespace App\Http\Requests\OrdenVenta;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Alta del pedido: lo que pide el cliente, en producto y cantidad.
 *
 * No se valida stock ni almacén: el vendedor pide, y es el almacén quien
 * después decide con qué rollos y desde dónde lo cubre. Comprometer aquí una
 * existencia concreta sería prometer algo que el vendedor no puede ver.
 */
class StoreOrdenVentaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'cliente_id' => 'nullable|exists:clientes,id',
            'vendedor_id' => 'required|exists:users,id',
            'fecha_emision' => 'required|date',
            'fecha_entrega' => 'nullable|date|after_or_equal:fecha_emision',
            'moneda' => 'nullable|string|max:10',
            'observaciones' => 'nullable|string',

            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            // Opcional: el almacén solo exige el color cuando la línea lo trae.
            'detalles.*.producto_color_id' => 'nullable|exists:producto_colores,id',
            'detalles.*.cantidad' => 'required|numeric|min:0.01',
            'detalles.*.precio_unitario' => 'nullable|numeric|min:0',
            'detalles.*.descuento' => 'nullable|numeric|min:0',
            'detalles.*.descripcion' => 'nullable|string|max:500',
            // Precio "por confirmar": no se sabe el metraje real del rollo
            // todavía. La línea no entra al subtotal del pedido.
            'detalles.*.precio_oculto' => 'nullable|boolean',
        ];
    }

    public function messages(): array
    {
        return [
            'detalles.required' => 'Agrega al menos un producto al pedido.',
            'detalles.min' => 'Agrega al menos un producto al pedido.',
            'detalles.*.producto_presentacion_id.required' => 'Elige la presentación del producto.',
            'detalles.*.cantidad.min' => 'La cantidad debe ser mayor que cero.',
        ];
    }
}
