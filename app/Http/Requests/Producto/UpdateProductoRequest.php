<?php
namespace App\Http\Requests\Producto;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProductoRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'codigo' => ['required', 'string', 'max:255', Rule::unique('productos', 'codigo')->ignore($this->route('producto'))],
            'codigo_barras' => 'nullable|string|max:255',
            'nombre' => 'required|string|max:255',
            'descripcion_ticket' => 'nullable|string|max:255',
            'marca_id' => 'nullable|exists:marcas,id',
            'sub_marca_id' => 'nullable|exists:sub_marcas,id',
            'categoria_id' => 'nullable|exists:categorias,id',
            'sub_categoria_id' => 'nullable|exists:categorias,id',
            'unidad_medida_id' => 'required|exists:unidades_medida,id',
            'unidad_compra_id' => 'nullable|exists:unidades_medida,id',
            'unidad_base_id' => 'nullable|exists:unidades_medida,id',
            'factor_compra_base' => 'nullable|numeric|min:0.01',
            'descripcion' => 'nullable|string|max:5000',
            'imagen' => 'nullable|string|max:255',
            'ficha_tecnica' => 'nullable|string|max:255',
            'accion_tecnica' => 'nullable|string|max:5000',

            // Ficha técnica de tela (todo opcional: mercería y avíos no la usan).
            'composicion' => 'nullable|string|max:255',
            'ancho_cm' => 'nullable|numeric|min:0|max:999999',
            'gramaje' => 'nullable|numeric|min:0|max:999999',
            'tipo_tejido' => 'nullable|in:plano,punto',
            'elasticidad' => 'nullable|in:ninguna,mono,bi',
            'encogimiento' => 'nullable|numeric|min:0|max:100',
            'minimo_compra' => 'nullable|numeric|min:0',
            'usos' => 'nullable|string|max:5000',
            'propiedades' => 'nullable|string|max:5000',
            'cuidados' => 'nullable|string|max:5000',
            'precio_base' => 'nullable|numeric|min:0',
            'stock_minimo' => 'nullable|numeric|min:0',
            'stock_maximo' => 'nullable|numeric|min:0',
            'activo' => 'boolean',

            'presentaciones' => 'nullable|array',
            'presentaciones.*.nombre' => 'required|string|max:255',
            'presentaciones.*.codigo_barras' => 'nullable|string|max:255',
            'presentaciones.*.precio_venta' => 'nullable|numeric|min:0',
            'presentaciones.*.precio_compra' => 'nullable|numeric|min:0',
            'presentaciones.*.margen' => 'nullable|numeric',
            'presentaciones.*.factor_conversion' => 'required|numeric|min:0.001',
            'presentaciones.*.unidad_base_id' => 'nullable|exists:unidades_medida,id',
            'presentaciones.*.producto_complementario_id' => 'nullable|exists:productos,id',
            'presentaciones.*.cantidad_complementaria' => 'nullable|numeric|min:0',
            'presentaciones.*.activo' => 'boolean',

            'lote' => 'nullable|array',
            'lote.numero_lote' => 'nullable|string|max:255',
            'lote.fecha_vencimiento' => 'nullable|date',
            'lote.stock_inicial' => 'nullable|numeric|min:0',
        ];
    }

    public function messages(): array
    {
        return [
            'codigo.required' => 'El código del producto es obligatorio',
            'codigo.unique' => 'El código ya está registrado',
            'nombre.required' => 'El nombre del producto es obligatorio',
            'unidad_medida_id.required' => 'La unidad de medida es obligatoria',
            'presentaciones.*.nombre.required' => 'El nombre de la unidad derivada es obligatorio',
            'presentaciones.*.factor_conversion.required' => 'El factor es obligatorio',
            // Gama de colores del muestrario (opcional).
            'colores' => 'nullable|array',
            'colores.*.nombre' => 'required|string|max:255',
            'colores.*.codigo' => 'nullable|string|max:255',
            'colores.*.hex' => 'nullable|string|max:9',
            'colores.*.activo' => 'boolean',

        ];
    }
}
