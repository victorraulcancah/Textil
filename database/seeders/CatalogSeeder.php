<?php
namespace Database\Seeders;

use App\Models\Almacen;
use App\Models\Categoria;
use App\Models\Marca;
use App\Models\Producto;
use App\Models\ProductoAlmacenStock;
use App\Models\ProductoPresentacion;
use App\Models\Proveedor;
use App\Models\SubMarca;
use App\Models\UnidadMedida;
use Illuminate\Database\Seeder;

class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        // ── Unidades de Medida ──
        // La lista y sus factores viven en un solo sitio.
        $this->call(UnidadesMedidaSeeder::class);
        $uUnidad = UnidadMedida::where('abreviatura', 'u')->first();
        $uKg = UnidadMedida::where('abreviatura', 'kg')->first();
        $uG = UnidadMedida::where('abreviatura', 'g')->first();
        $uL = UnidadMedida::where('abreviatura', 'l')->first();
        $uMl = UnidadMedida::where('abreviatura', 'ml')->first();
        $uSaco = UnidadMedida::where('abreviatura', 'saco')->first();
        $uCaja = UnidadMedida::where('abreviatura', 'caja')->first();

        // ── Categorías (jerárquicas con categoria_padre_id) ──
        $catAbarrotes = Categoria::create(['nombre' => 'Abarrotes', 'nivel' => 1]);
        $catBebidas = Categoria::create(['nombre' => 'Bebidas', 'nivel' => 1]);
        $catLimpieza = Categoria::create(['nombre' => 'Limpieza', 'nivel' => 1]);

        Categoria::create(['nombre' => 'Lácteos', 'categoria_padre_id' => $catAbarrotes->id, 'nivel' => 2]);
        Categoria::create(['nombre' => 'Enlatados', 'categoria_padre_id' => $catAbarrotes->id, 'nivel' => 2]);
        Categoria::create(['nombre' => 'Granos y Cereales', 'categoria_padre_id' => $catAbarrotes->id, 'nivel' => 2]);
        Categoria::create(['nombre' => 'Gaseosas', 'categoria_padre_id' => $catBebidas->id, 'nivel' => 2]);
        Categoria::create(['nombre' => 'Jugos', 'categoria_padre_id' => $catBebidas->id, 'nivel' => 2]);
        Categoria::create(['nombre' => 'Aguas', 'categoria_padre_id' => $catBebidas->id, 'nivel' => 2]);
        Categoria::create(['nombre' => 'Lavandería', 'categoria_padre_id' => $catLimpieza->id, 'nivel' => 2]);
        Categoria::create(['nombre' => 'Cocina', 'categoria_padre_id' => $catLimpieza->id, 'nivel' => 2]);

        // ── Marcas ──
        $marcaGloria = Marca::create(['nombre' => 'Gloria']);
        $marcaSanFernando = Marca::create(['nombre' => 'San Fernando']);
        $marcaNestle = Marca::create(['nombre' => 'Nestlé']);
        $marcaCocaCola = Marca::create(['nombre' => 'Coca-Cola']);
        $marcaSapolio = Marca::create(['nombre' => 'Sapolio']);

        SubMarca::create(['marca_id' => $marcaGloria->id, 'nombre' => 'Gloria Leche']);
        SubMarca::create(['marca_id' => $marcaGloria->id, 'nombre' => 'Gloria Yogurt']);
        SubMarca::create(['marca_id' => $marcaSanFernando->id, 'nombre' => 'San Fernando Pollo']);
        SubMarca::create(['marca_id' => $marcaNestle->id, 'nombre' => 'Nestlé Cereales']);
        SubMarca::create(['marca_id' => $marcaCocaCola->id, 'nombre' => 'Coca-Cola Original']);
        SubMarca::create(['marca_id' => $marcaCocaCola->id, 'nombre' => 'Coca-Cola Zero']);
        SubMarca::create(['marca_id' => $marcaSapolio->id, 'nombre' => 'Sapolio Lavandería']);

        // ── Proveedores ──
        Proveedor::create(['nombre' => 'Distribuidora Gloria S.A.C.', 'codigo' => 'PROV001', 'ruc' => '20123456780', 'direccion' => 'Av. Industrial 500', 'telefono' => '999000111', 'email' => 'ventas@gloria.com.pe', 'contacto_nombre' => 'Carlos López']);
        Proveedor::create(['nombre' => 'San Fernando S.A.', 'codigo' => 'PROV002', 'ruc' => '20123456781', 'direccion' => 'Carretera Central Km 15', 'telefono' => '999000222', 'email' => 'ventas@sanfernando.com.pe', 'contacto_nombre' => 'María García']);
        Proveedor::create(['nombre' => 'Corporación Lindley S.A.', 'codigo' => 'PROV003', 'ruc' => '20123456782', 'direccion' => 'Av. Venezuela 3000', 'telefono' => '999000333', 'email' => 'ventas@lindley.com.pe', 'contacto_nombre' => 'José Martínez']);
        Proveedor::create(['nombre' => 'Distribuidora Nestlé Perú', 'codigo' => 'PROV004', 'ruc' => '20123456783', 'direccion' => 'Av. Elmer Faucett 400', 'telefono' => '999000444', 'email' => 'ventas@nestle.com.pe', 'contacto_nombre' => 'Ana Torres']);
        Proveedor::create(['nombre' => 'Sapolio S.A.C.', 'codigo' => 'PROV005', 'ruc' => '20123456784', 'direccion' => 'Jr. Limpieza 250', 'telefono' => '999000555', 'email' => 'ventas@sapolio.com.pe', 'contacto_nombre' => 'Pedro Ramírez']);

        // ── Almacenes ──
        $almacenPrincipal = Almacen::create(['nombre' => 'Almacén Principal', 'codigo' => 'ALM001', 'tipo' => 'principal', 'direccion' => 'Av. Principal 123', 'activo' => true]);
        Almacen::create(['nombre' => 'Tienda Centro', 'codigo' => 'ALM002', 'tipo' => 'tienda', 'direccion' => 'Jr. Lima 456', 'activo' => true]);
        Almacen::create(['nombre' => 'Almacén de Tránsito', 'codigo' => 'ALM003', 'tipo' => 'transito', 'direccion' => 'Carretera Central Km 10', 'activo' => true]);

        // ── Productos con Presentaciones ──
        $productosData = [
            [
                'codigo' => 'PROD001',
                'nombre' => 'Leche Gloria Evaporada',
                'marca_id' => $marcaGloria->id,
                'categoria_id' => $catAbarrotes->id,
                'unidad_medida_id' => $uUnidad->id,
                'unidad_base_id' => $uUnidad->id,
                'precio_base' => 4.50,
                'presentaciones' => [
                    ['nombre' => '400g (lata)', 'codigo_barras' => '7750071001001', 'precio_venta' => 4.50, 'factor_conversion' => 1, 'unidad_base_id' => $uUnidad->id],
                    ['nombre' => '900g (ideal)', 'codigo_barras' => '7750071002008', 'precio_venta' => 8.90, 'factor_conversion' => 1, 'unidad_base_id' => $uUnidad->id],
                ],
            ],
            [
                'codigo' => 'PROD002',
                'nombre' => 'Arroz Costeño',
                'marca_id' => $marcaSanFernando->id,
                'categoria_id' => $catAbarrotes->id,
                'unidad_medida_id' => $uKg->id,
                'unidad_base_id' => $uG->id,
                'unidad_compra_id' => $uSaco->id,
                'factor_compra_base' => 50000,
                'precio_base' => 3.80,
                'presentaciones' => [
                    ['nombre' => '500g', 'codigo_barras' => '7750071003005', 'precio_venta' => 2.00, 'factor_conversion' => 500, 'unidad_base_id' => $uG->id],
                    ['nombre' => '1kg', 'codigo_barras' => '7750071004002', 'precio_venta' => 3.80, 'factor_conversion' => 1000, 'unidad_base_id' => $uG->id],
                    ['nombre' => '5kg', 'codigo_barras' => '7750071005009', 'precio_venta' => 17.50, 'factor_conversion' => 5000, 'unidad_base_id' => $uG->id],
                ],
            ],
            [
                'codigo' => 'PROD003',
                'nombre' => 'Aceite Primor',
                'marca_id' => $marcaNestle->id,
                'categoria_id' => $catAbarrotes->id,
                'unidad_medida_id' => $uL->id,
                'unidad_base_id' => $uMl->id,
                'precio_base' => 8.50,
                'presentaciones' => [
                    ['nombre' => '500ml', 'codigo_barras' => '7750071006006', 'precio_venta' => 4.50, 'factor_conversion' => 500, 'unidad_base_id' => $uMl->id],
                    ['nombre' => '1L', 'codigo_barras' => '7750071007003', 'precio_venta' => 8.50, 'factor_conversion' => 1000, 'unidad_base_id' => $uMl->id],
                ],
            ],
            [
                'codigo' => 'PROD004',
                'nombre' => 'Gaseosa Coca-Cola',
                'marca_id' => $marcaCocaCola->id,
                'categoria_id' => $catBebidas->id,
                'unidad_medida_id' => $uL->id,
                'unidad_base_id' => $uMl->id,
                'precio_base' => 10.00,
                'presentaciones' => [
                    ['nombre' => '500ml', 'codigo_barras' => '7750071008000', 'precio_venta' => 2.50, 'factor_conversion' => 500, 'unidad_base_id' => $uMl->id],
                    ['nombre' => '1.5L', 'codigo_barras' => '7750071009007', 'precio_venta' => 5.50, 'factor_conversion' => 1500, 'unidad_base_id' => $uMl->id],
                    ['nombre' => '3L', 'codigo_barras' => '7750071010004', 'precio_venta' => 10.00, 'factor_conversion' => 3000, 'unidad_base_id' => $uMl->id],
                ],
            ],
            [
                'codigo' => 'PROD005',
                'nombre' => 'Detergente Sapolio',
                'marca_id' => $marcaSapolio->id,
                'categoria_id' => $catLimpieza->id,
                'unidad_medida_id' => $uKg->id,
                'unidad_base_id' => $uG->id,
                'precio_base' => 6.20,
                'presentaciones' => [
                    ['nombre' => '500g', 'codigo_barras' => '7750071011001', 'precio_venta' => 3.50, 'factor_conversion' => 500, 'unidad_base_id' => $uG->id],
                    ['nombre' => '1kg', 'codigo_barras' => '7750071012008', 'precio_venta' => 6.20, 'factor_conversion' => 1000, 'unidad_base_id' => $uG->id],
                ],
            ],
            [
                'codigo' => 'PROD006',
                'nombre' => 'Fideos Don Vittorio',
                'marca_id' => $marcaNestle->id,
                'categoria_id' => $catAbarrotes->id,
                'unidad_medida_id' => $uKg->id,
                'unidad_base_id' => $uG->id,
                'precio_base' => 2.50,
                'presentaciones' => [
                    ['nombre' => '500g', 'codigo_barras' => '7750071013005', 'precio_venta' => 2.50, 'factor_conversion' => 500, 'unidad_base_id' => $uG->id],
                    ['nombre' => '1kg', 'codigo_barras' => '7750071014002', 'precio_venta' => 4.80, 'factor_conversion' => 1000, 'unidad_base_id' => $uG->id],
                ],
            ],
            [
                'codigo' => 'PROD007',
                'nombre' => 'Agua Cielo',
                'marca_id' => $marcaCocaCola->id,
                'categoria_id' => $catBebidas->id,
                'unidad_medida_id' => $uL->id,
                'unidad_base_id' => $uMl->id,
                'precio_base' => 3.00,
                'presentaciones' => [
                    ['nombre' => '625ml', 'codigo_barras' => '7750071015009', 'precio_venta' => 1.50, 'factor_conversion' => 625, 'unidad_base_id' => $uMl->id],
                    ['nombre' => '2.5L', 'codigo_barras' => '7750071016006', 'precio_venta' => 3.00, 'factor_conversion' => 2500, 'unidad_base_id' => $uMl->id],
                ],
            ],
            [
                'codigo' => 'PROD008',
                'nombre' => 'Yogurt Gloria Fresa',
                'marca_id' => $marcaGloria->id,
                'categoria_id' => $catAbarrotes->id,
                'unidad_medida_id' => $uL->id,
                'unidad_base_id' => $uMl->id,
                'precio_base' => 7.50,
                'presentaciones' => [
                    ['nombre' => '1L', 'codigo_barras' => '7750071017003', 'precio_venta' => 7.50, 'factor_conversion' => 1000, 'unidad_base_id' => $uMl->id],
                ],
            ],
            [
                'codigo' => 'PROD009',
                'nombre' => 'Lejía Sapolio',
                'marca_id' => $marcaSapolio->id,
                'categoria_id' => $catLimpieza->id,
                'unidad_medida_id' => $uL->id,
                'unidad_base_id' => $uMl->id,
                'precio_base' => 4.90,
                'presentaciones' => [
                    ['nombre' => '1L', 'codigo_barras' => '7750071018000', 'precio_venta' => 4.90, 'factor_conversion' => 1000, 'unidad_base_id' => $uMl->id],
                ],
            ],
            [
                'codigo' => 'PROD010',
                'nombre' => 'Azúcar Rubia',
                'marca_id' => $marcaSanFernando->id,
                'categoria_id' => $catAbarrotes->id,
                'unidad_medida_id' => $uKg->id,
                'unidad_base_id' => $uG->id,
                'unidad_compra_id' => $uSaco->id,
                'factor_compra_base' => 50000,
                'precio_base' => 3.20,
                'presentaciones' => [
                    ['nombre' => '500g', 'codigo_barras' => '7750071019007', 'precio_venta' => 1.70, 'factor_conversion' => 500, 'unidad_base_id' => $uG->id],
                    ['nombre' => '1kg', 'codigo_barras' => '7750071020004', 'precio_venta' => 3.20, 'factor_conversion' => 1000, 'unidad_base_id' => $uG->id],
                    ['nombre' => '5kg', 'codigo_barras' => '7750071021001', 'precio_venta' => 15.00, 'factor_conversion' => 5000, 'unidad_base_id' => $uG->id],
                ],
            ],
        ];

        foreach ($productosData as $data) {
            $presentaciones = $data['presentaciones'] ?? [];
            unset($data['presentaciones']);

            $producto = Producto::create($data);

            foreach ($presentaciones as $presData) {
                ProductoPresentacion::create(array_merge(
                    $presData,
                    ['producto_id' => $producto->id]
                ));
            }

            // Stock inicial: una fila por producto (en unidad base) con costo promedio
            // aproximado (~60% del precio base), para poblar Existencias y el Kardex valorizado.
            $stock = rand(20, 200);
            ProductoAlmacenStock::create([
                'producto_id' => $producto->id,
                'almacen_id' => $almacenPrincipal->id,
                'stock_actual' => $stock,
                'stock_anterior' => 0,
                'stock_reservado' => 0,
                'stock_disponible' => $stock,
                'costo_promedio' => round((float) ($producto->precio_base ?? 0) * 0.6, 2),
                'stock_minimo' => 10,
                'stock_maximo' => 500,
            ]);
        }
    }
}
