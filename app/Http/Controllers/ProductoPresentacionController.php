<?php
namespace App\Http\Controllers;

use App\Models\Producto;
use App\Models\ProductoPresentacion;
use Illuminate\Http\Request;

class ProductoPresentacionController extends Controller
{
    private function rules(?int $ignoreId = null): array
    {
        $barcodeUnique = 'nullable|string|max:255|unique:producto_presentaciones,codigo_barras';
        if ($ignoreId) {
            $barcodeUnique .= ',' . $ignoreId;
        }

        return [
            'nombre' => 'required|string|max:255',
            'codigo_barras' => $barcodeUnique,
            'precio_venta' => 'nullable|numeric|min:0',
            'precio_compra' => 'nullable|numeric|min:0',
            'margen' => 'nullable|numeric',
            'factor_conversion' => 'required|numeric|min:0.001',
            'unidad_base_id' => 'nullable|exists:unidades_medida,id',
            'producto_complementario_id' => 'nullable|exists:productos,id',
            'cantidad_complementaria' => 'nullable|numeric|min:0',
            'activo' => 'boolean',
        ];
    }

    public function index(Producto $producto)
    {
        return response()->json(
            $producto->presentaciones()->with(['unidadBase', 'complementario'])->orderBy('factor_conversion')->get()
        );
    }

    public function store(Request $request, Producto $producto)
    {
        $data = $request->validate($this->rules());
        $data['producto_id'] = $producto->id;
        $presentacion = ProductoPresentacion::create($data);

        return response()->json($presentacion->load(['unidadBase', 'complementario']), 201);
    }

    public function show(ProductoPresentacion $presentacion)
    {
        return response()->json($presentacion->load(['unidadBase', 'complementario']));
    }

    public function update(Request $request, ProductoPresentacion $presentacion)
    {
        $data = $request->validate($this->rules($presentacion->id));
        $presentacion->update($data);

        return response()->json($presentacion->load(['unidadBase', 'complementario']));
    }

    public function destroy(ProductoPresentacion $presentacion)
    {
        $presentacion->delete();
        return response()->json(['message' => 'Presentación eliminada']);
    }
}
