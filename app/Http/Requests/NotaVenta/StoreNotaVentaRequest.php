<?php
namespace App\Http\Requests\NotaVenta;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Contracts\Validation\Validator;

class StoreNotaVentaRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'cliente_id' => 'nullable|exists:clientes,id',
            'almacen_id' => 'required|exists:almacenes,id',
            'vendedor_id' => 'required|exists:users,id',
            'fecha_emision' => 'required|date',
            'moneda' => 'string|max:10|in:PEN,USD',
            'tipo_pago' => 'string|max:20|in:contado,credito',
            'subtotal' => 'required|numeric|min:0',
            'descuento_total' => 'numeric|min:0',
            'total' => 'required|numeric|min:0',
            'observaciones' => 'nullable|string',
            'serie' => 'nullable|string|max:10',
            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.cantidad' => 'required|numeric|min:0.01',
            'detalles.*.precio_unitario' => 'required|numeric|min:0',
            'detalles.*.descuento' => 'numeric|min:0',
            'detalles.*.subtotal' => 'required|numeric|min:0',
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
            'almacen_id.required' => 'El almacén es obligatorio',
            'almacen_id.exists' => 'El almacén seleccionado no existe',
            'vendedor_id.required' => 'El vendedor es obligatorio',
            'fecha_emision.required' => 'La fecha de emisión es obligatoria',
            'fecha_emision.date' => 'La fecha de emisión no es válida',
            'moneda.in' => 'La moneda debe ser PEN o USD',
            'tipo_pago.in' => 'El tipo de pago debe ser contado o crédito',
            'subtotal.required' => 'El subtotal es obligatorio',
            'subtotal.min' => 'El subtotal debe ser mayor o igual a 0',
            'total.required' => 'El total es obligatorio',
            'total.min' => 'El total debe ser mayor o igual a 0',
            'detalles.required' => 'Debe incluir al menos un detalle',
            'detalles.min' => 'Debe incluir al menos un detalle',
            'detalles.*.producto_presentacion_id.required' => 'El producto es obligatorio en cada detalle',
            'detalles.*.cantidad.required' => 'La cantidad es obligatoria en cada detalle',
            'detalles.*.cantidad.min' => 'La cantidad debe ser mayor a 0',
            'detalles.*.precio_unitario.required' => 'El precio unitario es obligatorio',
            'detalles.*.precio_unitario.min' => 'El precio unitario debe ser mayor o igual a 0',
            'detalles.*.subtotal.required' => 'El subtotal del detalle es obligatorio',
            'pagos.required' => 'Debe incluir al menos un pago',
            'pagos.min' => 'Debe incluir al menos un pago',
            'pagos.*.forma_pago.required' => 'La forma de pago es obligatoria',
            'pagos.*.monto.required' => 'El monto del pago es obligatorio',
            'pagos.*.monto.min' => 'El monto del pago debe ser mayor a 0',
            'pagos.*.fecha.required' => 'La fecha del pago es obligatoria',
        ];
    }

    protected function failedValidation(Validator $validator): never
    {
        throw new HttpResponseException(
            response()->json([
                'res' => false,
                'message' => 'Error de validación.',
                'errors' => $validator->errors(),
            ], 422)
        );
    }
}
