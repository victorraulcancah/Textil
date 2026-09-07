<?php
namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductoResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'codigo' => $this->codigo,
            'codigo_barras' => $this->codigo_barras,
            'nombre' => $this->nombre,
            'descripcion_ticket' => $this->descripcion_ticket,
            'marca' => new MarcaResource($this->whenLoaded('marca')),
            'sub_marca' => new SubMarcaResource($this->whenLoaded('subMarca')),
            // Quiénes traen la tela. Cada uno con su código y su precio.
            'proveedores' => $this->whenLoaded('proveedores', fn () => $this->proveedores->map(fn ($p) => [
                'proveedor_id' => $p->id,
                'nombre' => $p->nombre,
                'codigo_proveedor' => $p->pivot->codigo_proveedor,
                'precio_referencia' => $p->pivot->precio_referencia,
                'moneda' => $p->pivot->moneda,
                'dias_entrega' => $p->pivot->dias_entrega,
                'principal' => (bool) $p->pivot->principal,
            ])->values()),
            'categoria' => new CategoriaResource($this->whenLoaded('categoria')),
            'sub_categoria' => new CategoriaResource($this->whenLoaded('subCategoria')),
            'unidad_medida' => new UnidadMedidaResource($this->whenLoaded('unidadMedida')),
            'unidad_compra' => new UnidadMedidaResource($this->whenLoaded('unidadCompra')),
            // El id va suelto porque el listado no carga la relación y el
            // formulario lo necesita para reconstruir "compro por…" al editar.
            'unidad_compra_id' => $this->unidad_compra_id,
            'unidad_base' => new UnidadMedidaResource($this->whenLoaded('unidadBase')),
            'factor_compra_base' => $this->factor_compra_base,
            'descripcion' => $this->descripcion,
            'imagen' => $this->imagen,
            'ficha_tecnica' => $this->ficha_tecnica,
            'accion_tecnica' => $this->accion_tecnica,

            // Ficha técnica de tela (null en mercería y avíos).
            'composicion' => $this->composicion,
            'ancho_cm' => $this->ancho_cm,
            'gramaje' => $this->gramaje,
            'peso_por_metro' => $this->peso_por_metro,
            'tipo_tejido' => $this->tipo_tejido,
            'elasticidad' => $this->elasticidad,
            'encogimiento' => $this->encogimiento,
            'minimo_compra' => $this->minimo_compra,
            'usos' => $this->usos,
            'propiedades' => $this->propiedades,
            'cuidados' => $this->cuidados,

            'precio_base' => $this->precio_base,
            'stock_minimo' => $this->stock_minimo,
            'stock_maximo' => $this->stock_maximo,
            'activo' => $this->activo,
            'imagen_url' => $this->imagen_url,
            'colores' => $this->whenLoaded('colores'),
            'presentaciones' => ProductoPresentacionResource::collection($this->whenLoaded('presentaciones')),
            'lotes' => ProductoLoteResource::collection($this->whenLoaded('lotes')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
