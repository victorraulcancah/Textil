<?php
namespace App\Http\Controllers;

use App\Http\Requests\Producto\StoreProductoRequest;
use App\Http\Requests\Producto\UpdateProductoRequest;
use App\Http\Resources\ProductoResource;
use App\Models\Almacen;
use App\Models\Producto;
use App\Models\ProductoAlmacenStock;
use App\Models\ProductoLote;
use App\Models\ProductoPresentacion;
use App\Models\UnidadMedida;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProductoController extends Controller
{
    private const RELATIONS = [
        'marca', 'subMarca', 'categoria', 'subCategoria', 'unidadMedida',
        'unidadCompra', 'unidadBase',
        'presentaciones.unidadBase', 'presentaciones.complementario',
        'colores',
        'lotes',
    ];

    /**
     * Tablas que guardan con qué presentación se hizo un documento. Se
     * comprueban con Schema porque algunas columnas se agregaron y quitaron
     * por migración.
     */
    private const USOS_PRESENTACION = [
        'nota_venta_detalles',
        'compra_detalles',
        'ajuste_detalles',
        'prestamo_detalles',
        'prestamo_devoluciones',
        'transferencia_detalles',
        'toma_inventario_detalles',
        'movimientos_inventario',
    ];

    public function index(Request $request)
    {
        $perPage = min(max((int) $request->input('per_page', 15), 1), 500);

        $productos = Producto::with(['marca', 'subMarca', 'categoria', 'subCategoria', 'unidadMedida', 'presentaciones.unidadBase', 'colores'])
            ->latest('id')
            ->paginate($perPage);
        return ProductoResource::collection($productos);
    }

    public function store(StoreProductoRequest $request)
    {
        $data = $request->validated();

        $producto = DB::transaction(function () use ($data) {
            $producto = Producto::create($this->soloProducto($data));
            $this->syncPresentaciones($producto, $data['presentaciones'] ?? []);
            $this->syncColores($producto, $data['colores'] ?? []);
            $this->registrarLoteInicial($producto, $data['lote'] ?? null);
            return $producto;
        });

        return new ProductoResource($producto->load(self::RELATIONS));
    }

    public function show(Producto $producto)
    {
        return new ProductoResource($producto->load(self::RELATIONS));
    }

    public function update(UpdateProductoRequest $request, Producto $producto)
    {
        $data = $request->validated();

        $cambiaUnidadBase = array_key_exists('unidad_medida_id', $data)
            && (int) $data['unidad_medida_id'] !== (int) $producto->unidad_medida_id;

        if ($cambiaUnidadBase && $this->tieneMovimiento($producto)) {
            return response()->json([
                'message' => 'No se puede cambiar la unidad en la que se cuenta el stock de un producto que ya tiene existencias o movimientos: las cantidades registradas quedarían mal contadas. Deja el stock en cero y sin documentos pendientes, o crea un producto nuevo.',
            ], 409);
        }

        DB::transaction(function () use ($producto, $data) {
            $producto->update($this->soloProducto($data));
            if (array_key_exists('presentaciones', $data)) {
                $this->syncPresentaciones($producto, $data['presentaciones'] ?? []);
            }
            if (array_key_exists('colores', $data)) {
                $this->syncColores($producto, $data['colores'] ?? []);
            }
        });

        return new ProductoResource($producto->load(self::RELATIONS));
    }

    public function destroy(Producto $producto)
    {
        $producto->delete();
        return response()->json(['message' => 'Producto eliminado correctamente']);
    }

    /** Solo las columnas propias del producto (sin presentaciones, colores ni lote). */
    private function soloProducto(array $data): array
    {
        return collect($data)->except(['presentaciones', 'colores', 'lote'])->all();
    }

    /**
     * Guarda la foto del producto. Va en su propia ruta porque el formulario
     * manda JSON (con presentaciones y colores anidados) y una imagen necesita
     * multipart: mezclarlos obligaría a serializar todo el árbol.
     */
    public function subirImagen(Request $request, Producto $producto)
    {
        $request->validate([
            'imagen' => 'required|file|extensions:png,jpg,jpeg,webp|max:4096',
        ], [
            'imagen.required' => 'Selecciona una imagen',
            'imagen.extensions' => 'La imagen debe ser PNG, JPG o WEBP',
            'imagen.max' => 'La imagen no debe superar 4 MB',
        ]);

        $anterior = $producto->imagen;

        $archivo = $request->file('imagen');
        $ext = strtolower($archivo->getClientOriginalExtension() ?: 'jpg');
        $producto->imagen = $archivo->storeAs('productos', Str::uuid().'.'.$ext, 'public');
        $producto->save();

        if ($anterior && Storage::disk('public')->exists($anterior)) {
            Storage::disk('public')->delete($anterior);
        }

        return new ProductoResource($producto->load(self::RELATIONS));
    }

    /**
     * Deja los colores del producto igual a la lista enviada. Se identifican
     * por nombre (único por producto), igual que las presentaciones, para no
     * borrarlos y recrearlos en cada guardado.
     */
    private function syncColores(Producto $producto, array $lista): void
    {
        $existentes = $producto->colores()->get()->keyBy('nombre');
        $conservados = [];

        foreach ($lista as $c) {
            $nombre = trim($c['nombre'] ?? '');
            if ($nombre === '') {
                continue;
            }

            $datos = [
                'codigo' => $c['codigo'] ?? null,
                'hex' => $c['hex'] ?? null,
                'activo' => $c['activo'] ?? true,
            ];

            if ($existente = $existentes->get($nombre)) {
                $existente->update($datos);
            } else {
                $producto->colores()->create($datos + ['nombre' => $nombre]);
            }

            $conservados[] = $nombre;
        }

        // Los que ya no están en la lista se eliminan (son catálogo, no
        // apuntan a documentos), junto con su foto si la tenían.
        foreach ($existentes as $nombre => $color) {
            if (in_array($nombre, $conservados, true)) {
                continue;
            }
            if ($color->imagen && Storage::disk('public')->exists($color->imagen)) {
                Storage::disk('public')->delete($color->imagen);
            }
            $color->delete();
        }
    }

    /**
     * Deja las presentaciones del producto igual a la lista enviada, pero SIN
     * borrarlas y recrearlas: una venta apunta a la presentación con la que se
     * hizo, así que borrarla rompe la clave foránea y se pierde el histórico.
     *
     * Las que siguen en la lista se actualizan (se identifican por nombre, que
     * es único por producto); las que desaparecen se borran solo si nadie las
     * usa, y si tienen historial se desactivan.
     */
    private function syncPresentaciones(Producto $producto, array $lista): void
    {
        $existentes = $producto->presentaciones()->get()->keyBy('nombre');
        $conservadas = [];

        foreach ($lista as $p) {
            $datos = [
                'nombre' => $p['nombre'],
                'codigo_barras' => $p['codigo_barras'] ?? null,
                'precio_venta' => $p['precio_venta'] ?? 0,
                'precio_compra' => $p['precio_compra'] ?? 0,
                'margen' => $p['margen'] ?? 0,
                'factor_conversion' => $p['factor_conversion'],
                'unidad_base_id' => $p['unidad_base_id'] ?? null,
                'producto_complementario_id' => $p['producto_complementario_id'] ?? null,
                'cantidad_complementaria' => $p['cantidad_complementaria'] ?? 0,
                'activo' => $p['activo'] ?? true,
            ];

            $actual = $existentes->get($p['nombre']);

            if ($actual) {
                $actual->update($datos);
                $conservadas[] = $actual->id;
            } else {
                $nueva = ProductoPresentacion::create($datos + ['producto_id' => $producto->id]);
                $conservadas[] = $nueva->id;
            }
        }

        foreach ($existentes as $vieja) {
            if (in_array($vieja->id, $conservadas, true)) {
                continue;
            }

            if ($this->presentacionEnUso($vieja->id)) {
                $vieja->update(['activo' => false]);
            } else {
                $vieja->delete();
            }
        }

        $this->asegurarPresentacionDeCompra($producto);
        $this->refrescarPrecioBase($producto);
    }

    /**
     * La unidad en la que se compra tiene que existir como formato: si compras
     * por saco, la compra debe poder registrarse en sacos. Sin esto el saco no
     * aparecía en ningún lado y había que comprar en kilos.
     *
     * Si el usuario ya lo puso como formato de venta, se respeta el suyo.
     */
    private function asegurarPresentacionDeCompra(Producto $producto): void
    {
        $factor = round((float) $producto->factor_compra_base, 4);

        if (! $producto->unidad_compra_id || $factor <= 0) {
            return;
        }

        $unidad = UnidadMedida::find($producto->unidad_compra_id);
        if (! $unidad) {
            return;
        }

        $existentes = $producto->presentaciones()->get();

        // Ya está, por nombre o porque algún formato equivale a una compra entera.
        if ($existentes->contains(fn ($p) => $p->nombre === $unidad->nombre
            || round((float) $p->factor_conversion, 4) === $factor)) {
            return;
        }

        // El costo por unidad base sale de cualquier formato ya valorizado.
        $refe = $existentes->first(fn ($p) => (float) $p->precio_compra > 0 && (float) $p->factor_conversion > 0);
        $costoBase = $refe ? (float) $refe->precio_compra / (float) $refe->factor_conversion : 0.0;
        $margen = $refe ? (float) $refe->margen : 0.0;
        $compra = round($costoBase * $factor, 4);

        ProductoPresentacion::create([
            'producto_id' => $producto->id,
            'nombre' => $unidad->nombre,
            'precio_compra' => $compra,
            'margen' => $margen,
            'precio_venta' => round($compra * (1 + $margen / 100), 4),
            'factor_conversion' => $factor,
            'unidad_base_id' => $unidad->id,
            'cantidad_complementaria' => 0,
            'activo' => true,
        ]);
    }

    /**
     * `precio_base` es una columna heredada de cuando un producto tenía un solo
     * precio. Hoy los precios viven en las presentaciones, así que se mantiene
     * al día con el precio de la unidad base (la de factor 1): es el que cuadra
     * con el stock, que también se cuenta en esa unidad.
     */
    private function refrescarPrecioBase(Producto $producto): void
    {
        $base = $producto->presentaciones()
            ->orderBy('factor_conversion')
            ->first();

        $producto->forceFill([
            'precio_base' => $base ? round((float) $base->precio_venta / max((float) $base->factor_conversion, 1), 4) : 0,
        ])->save();
    }

    /** ¿Algún documento apunta a esta presentación? */
    private function presentacionEnUso(int $presentacionId): bool
    {
        foreach (self::USOS_PRESENTACION as $tabla) {
            if (! Schema::hasTable($tabla) || ! Schema::hasColumn($tabla, 'producto_presentacion_id')) {
                continue;
            }

            if (DB::table($tabla)->where('producto_presentacion_id', $presentacionId)->exists()) {
                return true;
            }
        }

        return false;
    }

    /**
     * ¿El producto ya tiene vida en el sistema? Se usa para no dejar cambiar la
     * unidad base: el stock guardado está expresado en ella, y cambiarla
     * reinterpreta las cantidades (50 unidades pasarían a valer 50 gramos).
     */
    private function tieneMovimiento(Producto $producto): bool
    {
        $conStock = $producto->stocks()
            ->where(fn ($q) => $q->where('stock_actual', '!=', 0)->orWhere('stock_reservado', '!=', 0))
            ->exists();

        if ($conStock) {
            return true;
        }

        if (Schema::hasTable('movimientos_inventario')
            && DB::table('movimientos_inventario')->where('producto_id', $producto->id)->exists()) {
            return true;
        }

        foreach ($producto->presentaciones()->pluck('id') as $id) {
            if ($this->presentacionEnUso((int) $id)) {
                return true;
            }
        }

        return false;
    }

    /** Crea el lote inicial y carga el stock en el almacén principal. */
    private function registrarLoteInicial(Producto $producto, ?array $lote): void
    {
        if (! $lote) {
            return;
        }

        $stockInicial = (float) ($lote['stock_inicial'] ?? 0);
        $tieneLote = ! empty($lote['numero_lote']) || ! empty($lote['fecha_vencimiento']) || $stockInicial > 0;
        if (! $tieneLote) {
            return;
        }

        ProductoLote::create([
            'producto_id' => $producto->id,
            'numero_lote' => $lote['numero_lote'] ?? null,
            'fecha_vencimiento' => $lote['fecha_vencimiento'] ?? null,
            'stock_inicial' => $stockInicial,
        ]);

        if ($stockInicial > 0) {
            $almacen = Almacen::orderBy('id')->first();
            if ($almacen) {
                $stock = ProductoAlmacenStock::firstOrNew([
                    'producto_id' => $producto->id,
                    'almacen_id' => $almacen->id,
                ]);
                $actual = (float) ($stock->stock_actual ?? 0);
                $stock->stock_actual = $actual + $stockInicial;
                $stock->stock_disponible = $stock->stock_actual - (float) ($stock->stock_reservado ?? 0);
                $stock->save();
            }
        }
    }
}
