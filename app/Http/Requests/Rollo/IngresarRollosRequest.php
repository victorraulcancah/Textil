<?php

namespace App\Http\Requests\Rollo;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Ingreso masivo de rollos desde el packing list del proveedor.
 *
 * Los metrajes pueden llegar de dos formas, porque así es como los tiene el
 * usuario a mano:
 *   - `metrajes`: el texto pegado tal cual — "55 - 58 - 96, 78 85".
 *   - `rollos`: una lista con metros y peso por rollo, si se capturó a mano.
 */
class IngresarRollosRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'producto_id' => 'required|exists:productos,id',
            'producto_color_id' => 'nullable|exists:producto_colores,id',
            'almacen_id' => 'required|exists:almacenes,id',
            'recepcion_compra_id' => 'nullable|exists:recepciones_compra,id',

            'codigo_proveedor' => 'nullable|string|max:100',
            'costo_unitario' => 'nullable|numeric|min:0',

            'metrajes' => 'nullable|string',

            'rollos' => 'nullable|array',
            'rollos.*.metros' => 'required|numeric|min:0.01',
            'rollos.*.peso_kg' => 'nullable|numeric|min:0',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if (! $this->lineas()) {
                $validator->errors()->add(
                    'metrajes',
                    'Pega los metrajes de los rollos o captúralos uno por uno.'
                );
            }
        });
    }

    /**
     * Los rollos a crear, vengan del texto pegado o de la lista.
     *
     * @return list<array{metros: float, peso_kg: float|null}>
     */
    public function lineas(): array
    {
        if ($this->filled('rollos')) {
            return collect($this->input('rollos'))
                ->map(fn ($r) => [
                    'metros' => (float) $r['metros'],
                    'peso_kg' => isset($r['peso_kg']) ? (float) $r['peso_kg'] : null,
                ])
                ->filter(fn ($r) => $r['metros'] > 0)
                ->values()
                ->all();
        }

        // "55 - 58 - 96, 78  85" → [55, 58, 96, 78, 85]. Se acepta cualquier
        // separador porque el usuario pega lo que le mandó el proveedor.
        return collect(preg_split('/[^\d.,]+/', (string) $this->input('metrajes')))
            ->map(fn ($t) => (float) str_replace(',', '.', trim($t)))
            ->filter(fn ($m) => $m > 0)
            ->map(fn ($m) => ['metros' => $m, 'peso_kg' => null])
            ->values()
            ->all();
    }
}
