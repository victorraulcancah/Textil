<?php

namespace App\Http\Requests\OrdenVenta;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Emitir la nota de venta de un pedido ya despachado.
 *
 * Los rollos y los importes salen del pedido: aquí solo llega cómo paga el
 * cliente, igual que en una venta de mostrador.
 */
class FacturarPedidoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'serie' => 'nullable|string|max:10',
            'fecha_emision' => 'nullable|date',
            'tipo_pago' => 'nullable|in:contado,credito',

            'pagos' => 'required|array|min:1',
            'pagos.*.metodo_pago_id' => 'nullable|exists:metodos_pago,id',
            'pagos.*.forma_pago' => 'required|in:efectivo,transferencia,billetera,credito',
            'pagos.*.cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'pagos.*.billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'pagos.*.monto' => 'required|numeric|min:0.01',
            'pagos.*.fecha' => 'required|date',
            'pagos.*.referencia' => 'nullable|string|max:100',
        ];
    }

    public function messages(): array
    {
        return [
            'pagos.required' => 'Indica cómo paga el cliente para emitir la nota de venta.',
            'pagos.min' => 'Indica cómo paga el cliente para emitir la nota de venta.',
        ];
    }
}
