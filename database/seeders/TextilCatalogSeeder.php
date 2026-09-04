<?php

namespace Database\Seeders;

use App\Models\Categoria;
use App\Models\Marca;
use App\Models\Producto;
use App\Models\ProductoPresentacion;
use App\Models\SubMarca;
use App\Models\UnidadMedida;
use Illuminate\Database\Seeder;

/**
 * Catálogo base para una tienda de telas: unidades (largo y peso), categorías
 * por tipo de tejido, marcas y productos con sus formatos de venta.
 *
 * Cómo se modela una tela:
 *  - El LARGO es lo que se compra/vende; el ANCHO viene fijo de fábrica y va en
 *    el nombre y la descripción (1.10 m sencillo, 1.50 m doble ancho, 2.80 m gran ancho).
 *  - Unidad base = centímetro (factor 1) y metro = 100 cm, para que "1.5 metros
 *    al corte" se guarde exacto. La yarda = 91.44 cm.
 *  - Telas de punto/licra se venden AL PESO: base gramo, kilogramo = 1000.
 *  - Formatos: "Metro (al corte)", "Yarda", "Rollo de 25/50/100 m" (mayorista)
 *    y "Retazo" (saldo a precio fijo). El rollo es un envase: cuánto trae lo
 *    define cada producto (factor_conversion en cm).
 *
 * Idempotente por nombre/código: se puede volver a ejecutar sin duplicar.
 *
 *   php artisan db:seed --class=TextilCatalogSeeder
 */
class TextilCatalogSeeder extends Seeder
{
    /** [abreviatura, nombre, factor_base] — mismo criterio que UnidadesMedidaSeeder. */
    public const UNIDADES = [
        // Largo (base: centímetro)
        ['cm', 'Centímetro', 1],
        ['m', 'Metro', 100],
        ['yd', 'Yarda', 91.44],
        // Peso (base: gramo) — telas de punto y licras al peso
        ['g', 'Gramo', 1],
        ['kg', 'Kilogramo', 1000],
        // Pieza
        ['u', 'Unidad', 1],
        ['doc', 'Docena', 12],
        // Envases / formatos: su contenido lo define cada producto
        ['rollo', 'Rollo', 1],
        ['pza', 'Pieza', 1],
        ['cono', 'Cono', 1],
        ['retazo', 'Retazo', 1],
    ];

    public function run(): void
    {
        $u = $this->unidades();
        $cat = $this->categorias();
        $marca = $this->marcas();

        $productos = [
            // ── Telas de vestir (tejido plano) ──
            [
                'codigo' => 'TEL001',
                'composicion' => '100% Algodón', 'ancho_cm' => 150, 'gramaje' => 130,
                'tipo_tejido' => 'plano', 'elasticidad' => 'ninguna', 'encogimiento' => 5, 'minimo_compra' => 5,
                'usos' => 'Camisería, blusas, vestidos y ropa de niño.',
                'propiedades' => 'Suave, transpirable, fácil de coser.',
                'cuidados' => 'Lavar a 30 °C, secado a la sombra, planchado medio.',
                'nombre' => 'Popelina de algodón 1.50 m',
                'descripcion' => 'Doble ancho (1.50 m / 60"). Camisería, blusas y vestidos. Encoge 5-10 % al lavar: comprar 10 % extra.',
                'categoria_id' => $cat['Telas de vestir'], 'sub_categoria_id' => $cat['Algodón'],
                'marca_id' => $marca['Creditex'],
                'tipo' => 'largo', 'precio_m' => 14.90, 'costo_m' => 9.50,
                'rollos' => [50],
            ],
            [
                'codigo' => 'TEL002',
                'composicion' => '100% Algodón', 'ancho_cm' => 110, 'gramaje' => 120,
                'tipo_tejido' => 'plano', 'elasticidad' => 'ninguna', 'encogimiento' => 5, 'minimo_compra' => 3,
                'usos' => 'Patchwork, manualidades, camisería clásica.',
                'propiedades' => 'Estampado a color firme.',
                'cuidados' => 'Lavar a 30 °C, no usar lejía.',
                'nombre' => 'Algodón estampado patchwork 1.10 m',
                'descripcion' => 'Ancho sencillo (1.10 m / 44"). Patchwork, manualidades y camisería clásica.',
                'categoria_id' => $cat['Telas de vestir'], 'sub_categoria_id' => $cat['Algodón'],
                'marca_id' => $marca['Textil Piura'],
                'tipo' => 'largo', 'precio_m' => 12.50, 'costo_m' => 7.80,
                'rollos' => [25],
            ],
            [
                'codigo' => 'TEL003',
                'composicion' => '100% Lino', 'ancho_cm' => 140, 'gramaje' => 190,
                'tipo_tejido' => 'plano', 'elasticidad' => 'ninguna', 'encogimiento' => 8, 'minimo_compra' => 5,
                'usos' => 'Pantalones, vestidos y camisas de verano.',
                'propiedades' => 'Fibra natural, muy fresca; se arruga con facilidad.',
                'cuidados' => 'Lavar a 30 °C, planchar húmedo.',
                'nombre' => 'Lino natural 1.40 m',
                'descripcion' => 'Doble ancho (1.40 m / 54"). Pantalones, vestidos y camisas de verano. Fibra natural: encoge, comprar 10 % extra.',
                'categoria_id' => $cat['Telas de vestir'], 'sub_categoria_id' => $cat['Lino'],
                'marca_id' => $marca['Importado'],
                'tipo' => 'largo', 'precio_m' => 32.00, 'costo_m' => 21.00,
                'rollos' => [25, 50],
            ],
            [
                'codigo' => 'TEL004',
                'composicion' => '98% Algodón / 2% Elastano', 'ancho_cm' => 150, 'gramaje' => 400,
                'tipo_tejido' => 'plano', 'elasticidad' => 'mono', 'encogimiento' => 3, 'minimo_compra' => 5,
                'usos' => 'Jeans, casacas y faldas.',
                'propiedades' => '12 oz, resistente, con ligera recuperación.',
                'cuidados' => 'Lavar del revés en frío, no usar lejía.',
                'nombre' => 'Denim 12 oz 1.50 m',
                'descripcion' => 'Doble ancho (1.50 m / 60"). Jeans, casacas y faldas.',
                'categoria_id' => $cat['Telas de vestir'], 'sub_categoria_id' => $cat['Denim'],
                'marca_id' => $marca['Nuevo Mundo'],
                'tipo' => 'largo', 'precio_m' => 24.90, 'costo_m' => 16.00,
                'rollos' => [50, 100],
            ],
            [
                'codigo' => 'TEL005',
                'composicion' => '95% Poliéster / 5% Elastano', 'ancho_cm' => 150, 'gramaje' => 150,
                'tipo_tejido' => 'plano', 'elasticidad' => 'bi', 'encogimiento' => 2, 'minimo_compra' => 3,
                'usos' => 'Vestidos de fiesta, forros y blusas.',
                'propiedades' => 'Brillo satinado, buena caída.',
                'cuidados' => 'Lavar a mano en frío, planchado bajo.',
                'nombre' => 'Satén elástico 1.50 m',
                'descripcion' => 'Doble ancho (1.50 m / 60"). Vestidos de fiesta, forros y blusas.',
                'categoria_id' => $cat['Telas de vestir'], 'sub_categoria_id' => $cat['Seda y satén'],
                'marca_id' => $marca['Importado'],
                'tipo' => 'largo', 'precio_m' => 18.90, 'costo_m' => 12.00,
                'rollos' => [50],
            ],
            [
                'codigo' => 'TEL006',
                'composicion' => '65% Poliéster / 35% Algodón', 'ancho_cm' => 150, 'gramaje' => 240,
                'tipo_tejido' => 'plano', 'elasticidad' => 'ninguna', 'encogimiento' => 3, 'minimo_compra' => 5,
                'usos' => 'Pantalones de vestir, uniformes y ropa de trabajo.',
                'propiedades' => 'Antiarrugas, alta duración.',
                'cuidados' => 'Lavar a 40 °C, planchado medio.',
                'nombre' => 'Gabardina 1.50 m',
                'descripcion' => 'Doble ancho (1.50 m / 60"). Pantalones de vestir, uniformes y ropa de trabajo.',
                'categoria_id' => $cat['Telas de vestir'], 'sub_categoria_id' => $cat['Poliéster y mezclas'],
                'marca_id' => $marca['Universal Textil'],
                'tipo' => 'largo', 'precio_m' => 19.90, 'costo_m' => 13.00,
                'rollos' => [50],
            ],

            // ── Telas de punto (al peso) ──
            [
                'codigo' => 'TEL007',
                'composicion' => '100% Algodón', 'ancho_cm' => 180, 'gramaje' => 180,
                'tipo_tejido' => 'punto', 'elasticidad' => 'mono', 'encogimiento' => 6, 'minimo_compra' => 1,
                'usos' => 'Camisetas, polos y ropa básica.',
                'propiedades' => 'Título 30/1, tacto suave, antipilling.',
                'cuidados' => 'Lavar del revés a 30 °C, no secar en máquina.',
                'nombre' => 'Jersey de algodón 30/1 (al peso)',
                'descripcion' => 'Tejido de punto tubular 0.90 m (1.80 m abierto). Camisetas y polos. Se vende por kilo: 1 kg rinde ~4 m según gramaje.',
                'categoria_id' => $cat['Telas de punto'], 'sub_categoria_id' => $cat['Jersey'],
                'marca_id' => $marca['Textil Piura'],
                'tipo' => 'peso', 'precio_kg' => 42.00, 'costo_kg' => 30.00,
                'rollos_kg' => [20],
            ],
            [
                'codigo' => 'TEL008',
                'composicion' => '80% Poliamida / 20% Elastano', 'ancho_cm' => 160, 'gramaje' => 220,
                'tipo_tejido' => 'punto', 'elasticidad' => 'bi', 'encogimiento' => 2, 'minimo_compra' => 1,
                'usos' => 'Ropa deportiva, leggins y ropa de baño.',
                'propiedades' => 'Alta recuperación, secado rápido, protección UV.',
                'cuidados' => 'Lavar en frío, no usar suavizante ni secadora.',
                'nombre' => 'Licra suplex (al peso)',
                'descripcion' => 'Punto elástico 1.60 m de ancho. Ropa deportiva, leggins y ropa de baño. Se vende por kilo.',
                'categoria_id' => $cat['Telas de punto'], 'sub_categoria_id' => $cat['Licra'],
                'marca_id' => $marca['Importado'],
                'tipo' => 'peso', 'precio_kg' => 58.00, 'costo_kg' => 41.00,
                'rollos_kg' => [15],
            ],
            [
                'codigo' => 'TEL009',
                'composicion' => '95% Algodón / 5% Elastano', 'ancho_cm' => 180, 'gramaje' => 280,
                'tipo_tejido' => 'punto', 'elasticidad' => 'mono', 'encogimiento' => 5, 'minimo_compra' => 1,
                'usos' => 'Poleras, buzos y joggers.',
                'propiedades' => 'Rizo interior, abrigo medio.',
                'cuidados' => 'Lavar del revés a 30 °C, secado a la sombra.',
                'nombre' => 'French terry 1.80 m (al peso)',
                'descripcion' => 'Punto de algodón con rizo 1.80 m. Poleras, buzos y joggers. Se vende por kilo.',
                'categoria_id' => $cat['Telas de punto'], 'sub_categoria_id' => $cat['French terry'],
                'marca_id' => $marca['Creditex'],
                'tipo' => 'peso', 'precio_kg' => 48.00, 'costo_kg' => 34.00,
                'rollos_kg' => [20],
            ],

            // ── Hogar y tapicería (gran ancho) ──
            [
                'codigo' => 'TEL010',
                'composicion' => '70% Poliéster / 30% Algodón', 'ancho_cm' => 280, 'gramaje' => 420,
                'tipo_tejido' => 'plano', 'elasticidad' => 'ninguna', 'encogimiento' => 2, 'minimo_compra' => 3,
                'usos' => 'Tapicería de muebles, cojines y cabeceras.',
                'propiedades' => 'Alta resistencia a la abrasión, antimanchas.',
                'cuidados' => 'Limpieza en seco o con espuma.',
                'nombre' => 'Tapiz jacquard 2.80 m',
                'descripcion' => 'Gran ancho (2.80 m / 110"). Tapicería de muebles y cojines.',
                'categoria_id' => $cat['Hogar y tapicería'], 'sub_categoria_id' => $cat['Tapicería'],
                'marca_id' => $marca['Importado'],
                'tipo' => 'largo', 'precio_m' => 45.00, 'costo_m' => 30.00,
                'rollos' => [25],
            ],
            [
                'codigo' => 'TEL011',
                'composicion' => '100% Poliéster', 'ancho_cm' => 300, 'gramaje' => 300,
                'tipo_tejido' => 'plano', 'elasticidad' => 'ninguna', 'encogimiento' => 1, 'minimo_compra' => 3,
                'usos' => 'Cortinas con bloqueo de luz.',
                'propiedades' => 'Blackout, térmico, reduce ruido.',
                'cuidados' => 'Lavar a 30 °C, no usar lejía, planchado bajo.',
                'nombre' => 'Blackout para cortinas 3.00 m',
                'descripcion' => 'Gran ancho (3.00 m / 118"). Cortinas: el ancho de la tela es el alto de la cortina.',
                'categoria_id' => $cat['Hogar y tapicería'], 'sub_categoria_id' => $cat['Cortinas'],
                'marca_id' => $marca['Importado'],
                'tipo' => 'largo', 'precio_m' => 38.00, 'costo_m' => 25.00,
                'rollos' => [25, 50],
            ],
            [
                'codigo' => 'TEL012',
                'composicion' => '50% Algodón / 50% Poliéster', 'ancho_cm' => 280, 'gramaje' => 140,
                'tipo_tejido' => 'plano', 'elasticidad' => 'ninguna', 'encogimiento' => 4, 'minimo_compra' => 3,
                'usos' => 'Sábanas, fundas y mantelería.',
                'propiedades' => 'Preencogido, tacto fresco.',
                'cuidados' => 'Lavar a 40 °C, planchado medio.',
                'nombre' => 'Percal para sábanas 2.80 m',
                'descripcion' => 'Gran ancho (2.80 m / 110"). Sábanas, fundas y mantelería.',
                'categoria_id' => $cat['Hogar y tapicería'], 'sub_categoria_id' => $cat['Sábanas y mantelería'],
                'marca_id' => $marca['Nuevo Mundo'],
                'tipo' => 'largo', 'precio_m' => 22.00, 'costo_m' => 14.50,
                'rollos' => [50],
            ],

            // ── Mercería ──
            [
                'codigo' => 'MER001',
                'composicion' => '100% Algodón', 'ancho_cm' => 5, 'gramaje' => null,
                'tipo_tejido' => 'plano', 'elasticidad' => 'ninguna', 'encogimiento' => null, 'minimo_compra' => 1,
                'usos' => 'Terminaciones, lencería y decoración.',
                'propiedades' => 'Encaje de 5 cm de ancho.',
                'cuidados' => 'Lavar a mano en frío.',
                'nombre' => 'Encaje de algodón 5 cm',
                'descripcion' => 'Cinta de encaje de 5 cm de ancho. Se vende por metro o por pieza de 20 m.',
                'categoria_id' => $cat['Mercería'], 'sub_categoria_id' => $cat['Encajes y cintas'],
                'marca_id' => $marca['Importado'],
                'tipo' => 'largo', 'precio_m' => 3.50, 'costo_m' => 2.00,
                'rollos' => [20],
            ],
            [
                'codigo' => 'MER002',
                'composicion' => '85% Poliéster / 15% Elastano', 'ancho_cm' => 2, 'gramaje' => null,
                'tipo_tejido' => 'punto', 'elasticidad' => 'bi', 'encogimiento' => null, 'minimo_compra' => 1,
                'usos' => 'Pretinas, puños y ropa deportiva.',
                'propiedades' => 'Elástico plano de 2 cm, alta recuperación.',
                'cuidados' => 'Lavar a 30 °C, no planchar.',
                'nombre' => 'Elástico plano 2 cm',
                'descripcion' => 'Elástico de 2 cm. Se vende por metro o por rollo de 25 m.',
                'categoria_id' => $cat['Mercería'], 'sub_categoria_id' => $cat['Elásticos'],
                'marca_id' => $marca['Importado'],
                'tipo' => 'largo', 'precio_m' => 1.80, 'costo_m' => 1.00,
                'rollos' => [25],
            ],
            [
                'codigo' => 'MER003',
                'composicion' => '100% Poliéster', 'ancho_cm' => null, 'gramaje' => null,
                'tipo_tejido' => null, 'elasticidad' => null, 'encogimiento' => null, 'minimo_compra' => 1,
                'usos' => 'Costura general en máquina recta y remalladora.',
                'propiedades' => 'Cono de 5000 yardas, alta tenacidad.',
                'cuidados' => '—',
                'nombre' => 'Hilo de coser poliéster 5000 yd',
                'descripcion' => 'Cono de 5000 yardas. Se vende por cono o por docena.',
                'categoria_id' => $cat['Mercería'], 'sub_categoria_id' => $cat['Hilos'],
                'marca_id' => $marca['Universal Textil'],
                'tipo' => 'pieza', 'precio_u' => 9.50, 'costo_u' => 6.20,
                'unidad' => 'cono',
            ],
            [
                'codigo' => 'MER004',
                'composicion' => 'Nylon y poliéster', 'ancho_cm' => null, 'gramaje' => null,
                'tipo_tejido' => null, 'elasticidad' => null, 'encogimiento' => null, 'minimo_compra' => 1,
                'usos' => 'Faldas, pantalones y carteras.',
                'propiedades' => 'Cierre de nylon de 20 cm.',
                'cuidados' => '—',
                'nombre' => 'Cierre nylon 20 cm',
                'descripcion' => 'Cierre de nylon de 20 cm. Se vende por unidad o por docena.',
                'categoria_id' => $cat['Mercería'], 'sub_categoria_id' => $cat['Botones y cierres'],
                'marca_id' => $marca['Importado'],
                'tipo' => 'pieza', 'precio_u' => 1.20, 'costo_u' => 0.70,
                'unidad' => 'u',
            ],
        ];

        $creados = 0;
        foreach ($productos as $p) {
            if (Producto::where('codigo', $p['codigo'])->exists()) {
                continue;
            }
            $this->crearProducto($p, $u);
            $creados++;
        }

        $this->command?->info("Catálogo textil: {$creados} productos creados.");
    }

    /** Crea las unidades que falten (busca por abreviatura o nombre) y devuelve [abrev => id]. */
    private function unidades(): array
    {
        $ids = [];
        foreach (self::UNIDADES as [$abrev, $nombre, $factor]) {
            $unidad = UnidadMedida::where('abreviatura', $abrev)
                ->orWhereRaw('LOWER(nombre) = ?', [mb_strtolower($nombre)])
                ->first()
                ?? UnidadMedida::create(['nombre' => $nombre, 'abreviatura' => $abrev, 'factor_base' => $factor]);
            $ids[$abrev] = $unidad->id;
        }

        return $ids;
    }

    /** Categorías por tipo de tejido (padre → hijas). Devuelve [nombre => id]. */
    private function categorias(): array
    {
        $arbol = [
            'Telas de vestir' => ['Algodón', 'Lino', 'Denim', 'Seda y satén', 'Poliéster y mezclas'],
            'Telas de punto' => ['Jersey', 'Licra', 'French terry', 'Rib'],
            'Hogar y tapicería' => ['Tapicería', 'Cortinas', 'Sábanas y mantelería'],
            'Mercería' => ['Encajes y cintas', 'Elásticos', 'Hilos', 'Botones y cierres'],
        ];

        $ids = [];
        foreach ($arbol as $padre => $hijas) {
            $cp = Categoria::firstOrCreate(['nombre' => $padre, 'categoria_padre_id' => null], ['nivel' => 1]);
            $ids[$padre] = $cp->id;
            foreach ($hijas as $hija) {
                $ids[$hija] = Categoria::firstOrCreate(['nombre' => $hija, 'categoria_padre_id' => $cp->id], ['nivel' => 2])->id;
            }
        }

        return $ids;
    }

    /** Marcas (fábricas textiles) con una sub-marca de ejemplo. Devuelve [nombre => id]. */
    private function marcas(): array
    {
        $lista = [
            'Creditex' => ['Pima Premium'],
            'Textil Piura' => ['Algodón Pima'],
            'Nuevo Mundo' => ['Denim Casual'],
            'Universal Textil' => ['Polystel'],
            'Importado' => ['China', 'India'],
        ];

        $ids = [];
        foreach ($lista as $nombre => $subs) {
            $m = Marca::firstOrCreate(['nombre' => $nombre]);
            $ids[$nombre] = $m->id;
            foreach ($subs as $sub) {
                SubMarca::firstOrCreate(['marca_id' => $m->id, 'nombre' => $sub]);
            }
        }

        return $ids;
    }

    /** Producto + presentaciones según cómo se vende: por largo, al peso o por pieza. */
    private function crearProducto(array $p, array $u): void
    {
        $base = [
            'codigo' => $p['codigo'],
            'nombre' => $p['nombre'],
            'descripcion' => $p['descripcion'],
            'categoria_id' => $p['categoria_id'],
            'sub_categoria_id' => $p['sub_categoria_id'],
            'marca_id' => $p['marca_id'],
            'stock_minimo' => 0,
            'activo' => true,
        ];

        // Ficha técnica: solo las claves presentes en el producto.
        foreach (['composicion', 'ancho_cm', 'gramaje', 'tipo_tejido', 'elasticidad',
            'encogimiento', 'minimo_compra', 'usos', 'propiedades', 'cuidados'] as $campo) {
            if (array_key_exists($campo, $p)) {
                $base[$campo] = $p[$campo];
            }
        }

        if ($p['tipo'] === 'largo') {
            // Se maneja en metros, se guarda en centímetros, se compra por rollo.
            $rolloCm = max($p['rollos']) * 100;
            $producto = Producto::create($base + [
                'unidad_medida_id' => $u['m'],
                'unidad_base_id' => $u['cm'],
                'unidad_compra_id' => $u['rollo'],
                'factor_compra_base' => $rolloCm,
                'precio_base' => $p['precio_m'],
            ]);

            $pres = [
                ['nombre' => 'Metro (al corte)', 'factor_conversion' => 100, 'precio_venta' => $p['precio_m'], 'precio_compra' => $p['costo_m']],
                ['nombre' => 'Yarda (al corte)', 'factor_conversion' => 91.44, 'precio_venta' => round($p['precio_m'] * 0.9144, 2), 'precio_compra' => round($p['costo_m'] * 0.9144, 2)],
            ];
            foreach ($p['rollos'] as $m) {
                // Mayorista: rollo cerrado con ~10 % de descuento sobre el precio al corte.
                $pres[] = [
                    'nombre' => "Rollo {$m} m",
                    'factor_conversion' => $m * 100,
                    'precio_venta' => round($p['precio_m'] * $m * 0.90, 2),
                    'precio_compra' => round($p['costo_m'] * $m, 2),
                ];
            }
            // Saldo: trozo sobrante a precio fijo (se registra su largo real al vender).
            $pres[] = ['nombre' => 'Retazo (saldo)', 'factor_conversion' => 50, 'precio_venta' => round($p['precio_m'] * 0.5 * 0.7, 2), 'precio_compra' => 0, 'es_compra' => false];

            $this->presentaciones($producto, $pres, $u['cm']);

            return;
        }

        if ($p['tipo'] === 'peso') {
            $rolloG = max($p['rollos_kg']) * 1000;
            $producto = Producto::create($base + [
                'unidad_medida_id' => $u['kg'],
                'unidad_base_id' => $u['g'],
                'unidad_compra_id' => $u['rollo'],
                'factor_compra_base' => $rolloG,
                'precio_base' => $p['precio_kg'],
            ]);

            $pres = [
                ['nombre' => 'Kilogramo', 'factor_conversion' => 1000, 'precio_venta' => $p['precio_kg'], 'precio_compra' => $p['costo_kg']],
                ['nombre' => 'Medio kilo', 'factor_conversion' => 500, 'precio_venta' => round($p['precio_kg'] * 0.52, 2), 'precio_compra' => round($p['costo_kg'] / 2, 2)],
            ];
            foreach ($p['rollos_kg'] as $kg) {
                $pres[] = [
                    'nombre' => "Rollo {$kg} kg",
                    'factor_conversion' => $kg * 1000,
                    'precio_venta' => round($p['precio_kg'] * $kg * 0.90, 2),
                    'precio_compra' => round($p['costo_kg'] * $kg, 2),
                ];
            }

            $this->presentaciones($producto, $pres, $u['g']);

            return;
        }

        // Pieza: unidad o cono, y docena.
        $unidad = $u[$p['unidad']];
        $producto = Producto::create($base + [
            'unidad_medida_id' => $unidad,
            'unidad_base_id' => $unidad,
            'precio_base' => $p['precio_u'],
        ]);

        $this->presentaciones($producto, [
            ['nombre' => $p['unidad'] === 'cono' ? 'Cono' : 'Unidad', 'factor_conversion' => 1, 'precio_venta' => $p['precio_u'], 'precio_compra' => $p['costo_u']],
            ['nombre' => 'Docena', 'factor_conversion' => 12, 'precio_venta' => round($p['precio_u'] * 12 * 0.92, 2), 'precio_compra' => round($p['costo_u'] * 12, 2)],
        ], $unidad);
    }

    private function presentaciones(Producto $producto, array $lista, int $unidadBaseId): void
    {
        foreach ($lista as $pres) {
            $margen = $pres['precio_compra'] > 0
                ? round(($pres['precio_venta'] - $pres['precio_compra']) / $pres['precio_compra'] * 100, 2)
                : 0;

            ProductoPresentacion::create($pres + [
                'producto_id' => $producto->id,
                'unidad_base_id' => $unidadBaseId,
                'margen' => $margen,
                'es_compra' => $pres['es_compra'] ?? true,
                'es_venta' => true,
                'activo' => true,
            ]);
        }
    }
}
