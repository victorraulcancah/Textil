<?php
namespace App\Http\Controllers;

use App\Http\Requests\Producto\StoreProductoRequest;
use App\Http\Requests\Producto\UpdateProductoRequest;
use App\Http\Resources\ProductoResource;
use App\Models\Almacen;
use App\Models\Color;
use App\Models\Producto;
use App\Models\ProductoAlmacenStock;
use App\Models\ProductoLote;
use App\Models\ProductoPresentacion;
use App\Models\UnidadMedida;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use App\Support\Permisos;

class ProductoController extends Controller
{
    private const RELATIONS = [
        'marca', 'subMarca', 'proveedores:id,nombre', 'categoria', 'subCategoria', 'unidadMedida',
        'unidadCompra', 'unidadBase', 'tipoTela.familia',
        'presentaciones.unidadBase', 'presentaciones.complementario',
        'presentaciones.precios.tipoPrecio:id,principal,activo',
        'colores.color',
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
        // Pedidos y compras en curso también apuntan a su formato.
        'orden_venta_detalles',
        'orden_compra_detalles',
        'solicitud_compra_detalles',
        'recepcion_compra_detalles',
        'devolucion_proveedor_detalles',
    ];

    public function index(Request $request)
    {
        $perPage = min(max((int) $request->input('per_page', 15), 1), 500);

        // Con su lista de precios: pedidos y ventas toman de ahí el precio
        // según el tipo de precio del cliente y la cantidad.
        $productos = Producto::with(['marca', 'subMarca', 'proveedores:id,nombre', 'categoria', 'subCategoria', 'unidadMedida', 'presentaciones.unidadBase', 'presentaciones.precios.tipoPrecio:id,principal,activo', 'colores'])
            ->latest('id')
            ->paginate($perPage);
        return ProductoResource::collection($productos);
    }

    /**
     * La plantilla para cargar los colores de una tela desde Excel: la hoja
     * "Colores" (Código, Nombre, Nombre del proveedor) y, aparte, el catálogo
     * de colores que ya existen, para copiar sus códigos.
     */
    public function plantillaColores()
    {
        $libro = new \PhpOffice\PhpSpreadsheet\Spreadsheet();

        $hoja = $libro->getActiveSheet();
        $hoja->setTitle('Colores');
        $hoja->fromArray(['Código', 'Nombre', 'Nombre del proveedor'], null, 'A1');
        $hoja->getStyle('A1:C1')->getFont()->setBold(true);
        // El código como texto: si no, Excel se come los ceros (0074 → 74).
        $hoja->getStyle('A2:A1000')->getNumberFormat()
            ->setFormatCode(\PhpOffice\PhpSpreadsheet\Style\NumberFormat::FORMAT_TEXT);
        foreach (['A' => 12, 'B' => 28, 'C' => 34] as $columna => $ancho) {
            $hoja->getColumnDimension($columna)->setWidth($ancho);
        }

        $catalogo = $libro->createSheet();
        $catalogo->setTitle('Catálogo');
        $catalogo->fromArray(['Código', 'Nombre'], null, 'A1');
        $catalogo->getStyle('A1:B1')->getFont()->setBold(true);
        $fila = 2;
        foreach (Color::where('activo', true)->orderBy('codigo')->get(['codigo', 'nombre']) as $color) {
            $catalogo->setCellValueExplicit("A{$fila}", $color->codigo, \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
            $catalogo->setCellValue("B{$fila}", $color->nombre);
            $fila++;
        }
        $catalogo->getColumnDimension('A')->setWidth(12);
        $catalogo->getColumnDimension('B')->setWidth(28);

        $libro->setActiveSheetIndex(0);

        return response()->streamDownload(function () use ($libro) {
            (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($libro))->save('php://output');
        }, 'plantilla-colores.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * Lee un Excel con los colores de una tela y los devuelve listos para el
     * formulario, cruzados con el catálogo: por código y, si no trae código,
     * por nombre. Lo que no está en el catálogo se crea ahí (si quien lo sube
     * puede crear colores). No toca el producto: eso pasa al guardarlo.
     */
    public function importarColores(Request $request)
    {
        $request->validate(
            ['archivo' => 'required|file|mimes:xlsx,xls|max:5120'],
            [
                'archivo.required' => 'Elige el archivo de Excel.',
                'archivo.mimes' => 'El archivo debe ser un Excel (.xlsx o .xls).',
                'archivo.max' => 'El archivo no debe superar 5 MB.',
            ],
        );

        try {
            $libro = \PhpOffice\PhpSpreadsheet\IOFactory::load($request->file('archivo')->getRealPath());
        } catch (\Throwable) {
            return response()->json(['message' => 'No se pudo leer el archivo: ¿es un Excel válido?'], 422);
        }

        $hoja = $libro->getSheetByName('Colores') ?? $libro->getSheet(0);
        $filas = $hoja->toArray(null, true, true, false);

        $normalizar = fn ($t) => mb_strtolower(trim((string) preg_replace('/\s+/', ' ', strtr(
            (string) $t, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u']
        ))));

        $alias = [
            'codigo' => ['codigo', 'cod', 'cod.', 'codigo de color', 'codigo color'],
            'nombre' => ['nombre', 'color', 'nombre del color'],
            'proveedor' => ['nombre del proveedor', 'nombre proveedor', 'proveedor', 'color del proveedor'],
        ];
        $col = [];
        foreach ($filas[0] ?? [] as $indice => $texto) {
            foreach ($alias as $clave => $nombres) {
                if (in_array($normalizar($texto), $nombres, true)) {
                    $col[$clave] = $indice;
                }
            }
        }

        if (! isset($col['codigo']) && ! isset($col['nombre'])) {
            return response()->json([
                'message' => 'No se encontraron las columnas del Excel. Se esperan: Código, Nombre, Nombre del proveedor.',
            ], 422);
        }

        $puedeCrear = Permisos::puede($request->user(), 'catalogo.colores.crear');
        $todos = Color::all();
        $porCodigo = $todos->keyBy('codigo');
        $porNombre = $todos->keyBy(fn ($c) => $normalizar($c->nombre));

        $colores = [];
        $nuevos = [];
        $advertencias = [];
        $vistos = [];

        DB::transaction(function () use ($filas, $col, $normalizar, $puedeCrear, &$porCodigo, &$porNombre, &$colores, &$nuevos, &$advertencias, &$vistos) {
            foreach (array_slice($filas, 1) as $i => $fila) {
                $n = $i + 2;
                $codigo = isset($col['codigo']) ? trim((string) ($fila[$col['codigo']] ?? '')) : '';
                $nombre = isset($col['nombre']) ? trim((string) ($fila[$col['nombre']] ?? '')) : '';
                $proveedor = isset($col['proveedor']) ? trim((string) ($fila[$col['proveedor']] ?? '')) : '';

                if ($codigo === '' && $nombre === '') {
                    continue; // fila vacía
                }

                // Excel se come los ceros a la izquierda: 74 vuelve a ser 0074.
                if (ctype_digit($codigo) && strlen($codigo) < 4) {
                    $codigo = str_pad($codigo, 4, '0', STR_PAD_LEFT);
                }

                $color = ($codigo !== '' ? $porCodigo->get($codigo) : null)
                    ?? ($nombre !== '' ? $porNombre->get($normalizar($nombre)) : null);

                if (! $color) {
                    if ($nombre === '') {
                        $advertencias[] = "Fila {$n}: el código {$codigo} no está en el catálogo y no trae nombre para crearlo.";
                        continue;
                    }
                    if (! $puedeCrear) {
                        $advertencias[] = "Fila {$n}: \"{$nombre}\" no está en el catálogo y no tienes permiso para crear colores.";
                        continue;
                    }
                    if ($codigo !== '' && mb_strlen($codigo) !== 4) {
                        $advertencias[] = "Fila {$n}: el código \"{$codigo}\" no es válido (son 4 caracteres, ej. 0074); \"{$nombre}\" se crea con uno nuevo.";
                        $codigo = '';
                    }

                    $color = Color::create([
                        'codigo' => $codigo !== '' ? $codigo : Color::generarCodigo(),
                        'nombre' => $nombre,
                        'activo' => true,
                    ]);
                    $porCodigo->put($color->codigo, $color);
                    $porNombre->put($normalizar($color->nombre), $color);
                    $nuevos[] = "{$color->codigo} {$color->nombre}";
                }

                // Repetido en el mismo archivo: una sola vez.
                if (isset($vistos[$color->id])) {
                    continue;
                }
                $vistos[$color->id] = true;

                $colores[] = [
                    'color_id' => $color->id,
                    'nombre' => $color->nombre,
                    'codigo' => $color->codigo,
                    'hex' => $color->hex,
                    'nombre_proveedor' => $proveedor !== '' ? $proveedor : null,
                ];
            }
        });

        return response()->json([
            'colores' => $colores,
            'nuevos' => $nuevos,
            'advertencias' => $advertencias,
        ]);
    }

    public function store(StoreProductoRequest $request)
    {
        $data = $request->validated();

        $producto = DB::transaction(function () use ($data) {
            $producto = Producto::create($this->soloProducto($data));
            $this->syncPresentaciones($producto, $data['presentaciones'] ?? []);
            $this->syncColores($producto, $data['colores'] ?? []);
            $this->syncProveedores($producto, $data['proveedores'] ?? []);
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
            if (array_key_exists('proveedores', $data)) {
                $this->syncProveedores($producto, $data['proveedores'] ?? []);
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
        return collect($data)->except(['presentaciones', 'colores', 'proveedores', 'lote'])->all();
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
                // Del catálogo compartido, cuando se eligió de ahí (no de texto libre legado).
                'color_id' => $c['color_id'] ?? null,
                'codigo' => $c['codigo'] ?? null,
                // El proveedor nombra los colores a su manera; se guarda tal
                // cual para poder cruzar su packing list en el próximo embarque.
                'nombre_proveedor' => $c['nombre_proveedor'] ?? null,
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
                // El precio se pone en la lista de precios, no aquí: el
                // producto solo trae el sugerido para los formatos nuevos.
                $actual->update(Arr::except($datos, ['precio_venta', 'margen']));
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
        $producto->refrescarPrecioBase();
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

    /**
     * Deja el producto con exactamente los proveedores que llegan.
     *
     * Cada uno guarda cómo llama a la tela y a qué precio la cotiza: son los
     * datos que cambian de un proveedor a otro y por eso viven en la relación.
     * Si nadie viene marcado como principal se toma el primero, para que
     * siempre haya uno que proponer al recomprar.
     */
    private function syncProveedores(Producto $producto, array $lista): void
    {
        $filas = [];
        $hayPrincipal = collect($lista)->contains(fn ($p) => ! empty($p['principal']));

        foreach (array_values($lista) as $i => $p) {
            if (empty($p['proveedor_id'])) {
                continue;
            }

            $filas[$p['proveedor_id']] = [
                'codigo_proveedor' => $p['codigo_proveedor'] ?? null,
                'precio_referencia' => $p['precio_referencia'] ?? null,
                'moneda' => $p['moneda'] ?? 'PEN',
                'dias_entrega' => $p['dias_entrega'] ?? null,
                'principal' => ! empty($p['principal']) || (! $hayPrincipal && $i === 0),
                'activo' => $p['activo'] ?? true,
                'observaciones' => $p['observaciones'] ?? null,
            ];
        }

        $producto->proveedores()->sync($filas);
    }
}
