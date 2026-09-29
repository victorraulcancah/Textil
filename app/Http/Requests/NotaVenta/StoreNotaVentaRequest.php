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
            // En dólares; sin él se usa el SUNAT venta de la fecha.
            'tipo_cambio' => 'nullable|numeric|min:0.0001',
            'tipo_pago' => 'string|max:20|in:contado,credito',
            'subtotal' => 'required|numeric|min:0',
            'descuento_total' => 'numeric|min:0',
            'total' => 'required|numeric|min:0',
            'observaciones' => 'nullable|string',
            'serie' => 'nullable|string|max:10',
            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            // De qué rollo sale la tela. Si el producto va por rollos en ese
            // almacén, el servicio lo exige; aquí solo se comprueba que exista.
            'detalles.*.rollo_id' => 'nullable|integer|exists:rollos,id',
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
            // Una venta en dólares que se cobra con soles: el monto va en
            // soles y se abona su equivalente a este tipo de cambio.
            'pagos.*.moneda' => 'nullable|in:PEN,USD',
            'pagos.*.tipo_cambio' => 'nullable|numeric|min:0.0001',

            // A crédito: cuándo vence cada cuota y cuánto es. Sin cuotas, una
            // sola a los días de crédito del cliente.
            'cuotas' => 'nullable|array|max:60',
            'cuotas.*.fecha_vencimiento' => 'required|date',
            'cuotas.*.monto' => 'required|numeric|min:0.01',
            // Pasarse de la línea de crédito, si quien vende tiene permiso.
            'autorizar_exceso' => 'nullable|boolean',
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

    /**
     * Cada local vende en ciertas unidades: el mayorista despacha rollos y la
     * tienda corta metro a metro. Se comprueba aquí y no solo en pantalla, para
     * que la regla no se pueda saltar llamando a la API directamente.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $almacen = \App\Models\Almacen::with('unidadesVenta')->find($this->input('almacen_id'));

            // Sin unidades marcadas el almacén vende en todas.
            if (! $almacen || $almacen->unidadesVenta->isEmpty()) {
                return;
            }

            $permitidas = $almacen->unidadesVenta->pluck('nombre')->implode(', ');
            // Un local que vende rollos acepta la tela por metro si se lleva
            // el rollo entero: se cobran sus metros reales, pero sale el rollo.
            $vendeRollos = $almacen->unidadesVenta->contains(
                fn ($u) => str_contains(mb_strtolower($u->nombre.' '.$u->abreviatura), 'rollo')
            );

            foreach ((array) $this->input('detalles', []) as $i => $detalle) {
                $presentacion = \App\Models\ProductoPresentacion::with('producto')
                    ->find($detalle['producto_presentacion_id'] ?? null);

                if (! $presentacion || $almacen->vendeEn($presentacion->unidad_base_id)) {
                    continue;
                }

                $rollo = ! empty($detalle['rollo_id']) ? \App\Models\Rollo::find($detalle['rollo_id']) : null;
                if ($vendeRollos && $rollo) {
                    $metros = $presentacion->aMetros((float) ($detalle['cantidad'] ?? 0));
                    if ($metros + 0.001 >= (float) $rollo->metros_actual) {
                        continue;
                    }

                    $v->errors()->add(
                        "detalles.{$i}.cantidad",
                        "En {$almacen->nombre} solo se venden rollos enteros: el rollo {$rollo->codigo} tiene ".rtrim(rtrim(number_format((float) $rollo->metros_actual, 2, '.', ''), '0'), '.').' m.',
                    );

                    continue;
                }

                $v->errors()->add(
                    "detalles.{$i}.producto_presentacion_id",
                    "\"{$presentacion->nombre}\" de {$presentacion->producto?->nombre} no se vende en {$almacen->nombre}: ahí solo se vende en {$permitidas}.",
                );
            }
        });
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
