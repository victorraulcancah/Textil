<?php

namespace App\Http\Requests\OrdenVenta;

use App\Models\Almacen;
use App\Models\ProductoPresentacion;
use App\Models\Rollo;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Alta del pedido. Valida lo que no puede validar la base de datos:
 * que los rollos estén libres, que alcancen los metros, que el rollo esté en
 * el almacén del pedido y que ese local venda en esa unidad.
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
            'almacen_id' => 'required|exists:almacenes,id',
            'vendedor_id' => 'required|exists:users,id',
            'fecha_emision' => 'required|date',
            'fecha_entrega' => 'nullable|date|after_or_equal:fecha_emision',
            'moneda' => 'nullable|string|max:10',
            'observaciones' => 'nullable|string',

            'detalles' => 'required|array|min:1',
            'detalles.*.rollo_id' => 'required|exists:rollos,id',
            'detalles.*.producto_presentacion_id' => 'nullable|exists:producto_presentaciones,id',
            'detalles.*.metros' => 'required|numeric|min:0.01',
            'detalles.*.precio_unitario' => 'nullable|numeric|min:0',
            'detalles.*.descuento' => 'nullable|numeric|min:0',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $almacen = Almacen::with('unidadesVenta')->find($this->input('almacen_id'));
            $detalles = $this->input('detalles', []);

            $rollos = Rollo::with(['producto', 'color'])
                ->whereIn('id', collect($detalles)->pluck('rollo_id'))
                ->get()
                ->keyBy('id');

            $presentaciones = ProductoPresentacion::with('unidadBase')
                ->whereIn('id', collect($detalles)->pluck('producto_presentacion_id')->filter())
                ->get()
                ->keyBy('id');

            // Un mismo rollo dos veces en el pedido rompe el unique de la tabla
            // y, sobre todo, vendería la misma tela dos veces.
            $repetidos = collect($detalles)->pluck('rollo_id')->duplicates();
            foreach ($repetidos as $i => $rolloId) {
                $validator->errors()->add(
                    "detalles.{$i}.rollo_id",
                    'El rollo '.($rollos[$rolloId]->codigo ?? $rolloId).' está repetido en el pedido.'
                );
            }

            foreach ($detalles as $i => $linea) {
                $rollo = $rollos[$linea['rollo_id']] ?? null;

                if (! $rollo) {
                    continue;
                }

                if (! $this->rolloEsUtilizable($rollo)) {
                    $validator->errors()->add(
                        "detalles.{$i}.rollo_id",
                        "El rollo {$rollo->codigo} está {$this->estadoLegible($rollo)}: no se puede pedir."
                    );
                }

                if ((float) $linea['metros'] > (float) $rollo->metros_actual) {
                    $validator->errors()->add(
                        "detalles.{$i}.metros",
                        "El rollo {$rollo->codigo} tiene {$rollo->metros_actual} m disponibles."
                    );
                }

                if ($almacen && $rollo->almacen_id !== $almacen->id) {
                    $validator->errors()->add(
                        "detalles.{$i}.rollo_id",
                        "El rollo {$rollo->codigo} no está en {$almacen->nombre}."
                    );
                }

                // Respeta las reglas de venta del local: uno vende rollos
                // enteros, otro corta metro a metro.
                $presentacion = $presentaciones[$linea['producto_presentacion_id'] ?? null] ?? null;

                if ($almacen && $presentacion && ! $almacen->vendeEn($presentacion->unidad_base_id)) {
                    $permitidas = $almacen->unidadesVenta->pluck('nombre')->implode(', ');

                    $validator->errors()->add(
                        "detalles.{$i}.producto_presentacion_id",
                        "\"{$presentacion->nombre}\" no se vende en {$almacen->nombre}: ahí solo se vende en {$permitidas}."
                    );
                }
            }
        });
    }

    /** Un rollo se puede pedir si está libre y le queda tela. */
    protected function rolloEsUtilizable(Rollo $rollo): bool
    {
        return $rollo->estaDisponible();
    }

    protected function estadoLegible(Rollo $rollo): string
    {
        return strtolower(Rollo::ESTADOS[$rollo->estado] ?? $rollo->estado);
    }
}
