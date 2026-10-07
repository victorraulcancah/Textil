<?php

namespace App\Http\Controllers;

use App\Models\Producto;
use App\Models\Rollo;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * El detalle de un ajuste de inventario desde Excel: la plantilla para llenar y la lectura del archivo.
 *
 * La lectura NO guarda nada: devuelve las líneas ya resueltas (producto, color, rollo, unidad y costo) en la misma forma
 * que las arma la pantalla de "Nuevo ajuste", más la lista de filas que no se pudieron leer. Quien registra revisa la
 * tabla y guarda el ajuste como siempre.
 */
class AjusteImportController extends Controller
{
    /** Lo máximo que se lee de un archivo: más filas casi siempre son un error al llenarlo. */
    private const MAX_FILAS = 500;

    private function cabecera(string $tipo): array
    {
        return $tipo === 'salida'
            ? ['Producto', 'Código del rollo', 'Metros a restar', 'Costo']
            : ['Producto', 'Color', 'Rollos', 'Metros por rollo', 'Costo'];
    }

    // ───────────────────────── plantilla ─────────────────────────

    public function plantilla(Request $request)
    {
        $tipo = $request->query('tipo') === 'salida' ? 'salida' : 'entrada';
        $almacenId = $request->integer('almacen_id') ?: null;
        $cabecera = $this->cabecera($tipo);

        $libro = new Spreadsheet();
        $estilo = [
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '2563EB']],
        ];

        // Hoja 1: la que se llena y se vuelve a cargar.
        $hoja = $libro->getActiveSheet();
        $hoja->setTitle('Detalle');
        $hoja->fromArray($cabecera, null, 'A1');
        $ultima = chr(ord('A') + count($cabecera) - 1);
        $hoja->getStyle("A1:{$ultima}1")->applyFromArray($estilo);
        $hoja->freezePane('A2');
        foreach (range('A', $ultima) as $columna) {
            $hoja->getColumnDimension($columna)->setWidth(20);
        }
        // Los códigos van como texto: "001" no debe quedar en 1.
        $hoja->getStyle("A2:B1000")->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);

        // Hoja 2: los códigos válidos.
        $codigos = $libro->createSheet();
        $codigos->setTitle($tipo === 'salida' ? 'Rollos y productos' : 'Productos');
        $fila = 1;
        if ($tipo === 'salida') {
            $codigos->fromArray(['Código del rollo', 'Producto', 'Color', 'Metros', 'Almacén'], null, 'A1');
            $codigos->getStyle('A1:E1')->applyFromArray($estilo);
            $fila = 2;
            $rollos = AlmacenAcceso::limitar(Rollo::query())
                ->where('estado', Rollo::DISPONIBLE)
                ->where('metros_actual', '>', 0)
                ->when($almacenId, fn ($q) => $q->where('almacen_id', $almacenId))
                ->with(['producto:id,nombre', 'color:id,nombre', 'almacen:id,nombre'])
                ->orderBy('producto_id')->orderBy('producto_color_id')->orderBy('numero')
                ->limit(3000)
                ->get();
            foreach ($rollos as $r) {
                $codigos->setCellValueExplicit("A{$fila}", (string) $r->codigo, DataType::TYPE_STRING);
                $codigos->fromArray([$r->producto?->nombre, $r->color?->nombre, (float) $r->metros_actual, $r->almacen?->nombre], null, "B{$fila}", true);
                $fila++;
            }
            $fila += 2;
            $codigos->fromArray(['Producto (código)', 'Producto', 'Se cuenta en'], null, "A{$fila}");
            $codigos->getStyle("A{$fila}:C{$fila}")->applyFromArray($estilo);
            $fila++;
        } else {
            $codigos->fromArray(['Producto (código)', 'Producto', 'Color (código)', 'Color', 'Se cuenta en'], null, 'A1');
            $codigos->getStyle('A1:E1')->applyFromArray($estilo);
            $fila = 2;
        }

        $productos = Producto::query()
            ->where('activo', true)
            ->with(['presentaciones' => fn ($q) => $q->where('activo', true)->with('unidadBase:id,abreviatura'), 'colores' => fn ($q) => $q->where('activo', true)->orderBy('codigo')])
            ->orderBy('codigo')
            ->get();
        foreach ($productos as $p) {
            $esTela = $p->presentacionMetro() !== null;
            if ($tipo === 'salida') {
                // Las telas salen por rollo: aquí solo van los productos que se ajustan por unidad.
                if ($esTela) {
                    continue;
                }
                $pres = $this->presentacionBase($p);
                $codigos->setCellValueExplicit("A{$fila}", (string) $p->codigo, DataType::TYPE_STRING);
                $codigos->fromArray([$p->nombre, $pres?->nombre], null, "B{$fila}", true);
                $fila++;
                continue;
            }
            if ($esTela) {
                $lista = $p->colores->isEmpty() ? collect([null]) : $p->colores;
                foreach ($lista as $color) {
                    $codigos->setCellValueExplicit("A{$fila}", (string) $p->codigo, DataType::TYPE_STRING);
                    $codigos->setCellValueExplicit("C{$fila}", (string) ($color?->codigo ?? ''), DataType::TYPE_STRING);
                    $codigos->fromArray([$p->nombre], null, "B{$fila}", true);
                    $codigos->fromArray([$color?->nombre ?? 'Sin colores', 'Rollo (metros)'], null, "D{$fila}", true);
                    $fila++;
                }
            } else {
                $pres = $this->presentacionBase($p);
                $codigos->setCellValueExplicit("A{$fila}", (string) $p->codigo, DataType::TYPE_STRING);
                $codigos->fromArray([$p->nombre], null, "B{$fila}", true);
                $codigos->fromArray(['', '', $pres?->nombre], null, "C{$fila}", true);
                $fila++;
            }
        }
        foreach (range('A', 'E') as $columna) {
            $codigos->getColumnDimension($columna)->setAutoSize(true);
        }

        // Un ejemplo de varios metrajes de un mismo color, con una tela real del catálogo.
        if ($tipo === 'entrada') {
            $tela = $productos->first(fn ($p) => $p->presentacionMetro() !== null && $p->colores->isNotEmpty());
            if ($tela) {
                $color = $tela->colores->first();
                $ejemplo = $libro->createSheet();
                $ejemplo->setTitle('Ejemplo');
                $ejemplo->fromArray($cabecera, null, 'A1');
                $ejemplo->getStyle("A1:{$ultima}1")->applyFromArray($estilo);
                $ejemplo->setCellValueExplicit('A2', (string) $tela->codigo, DataType::TYPE_STRING);
                $ejemplo->setCellValueExplicit('B2', (string) $color->codigo, DataType::TYPE_STRING);
                $ejemplo->fromArray([1, 50], null, 'C2');
                $ejemplo->setCellValueExplicit('A3', (string) $tela->codigo, DataType::TYPE_STRING);
                $ejemplo->setCellValueExplicit('B3', (string) $color->codigo, DataType::TYPE_STRING);
                $ejemplo->fromArray([2, 80], null, 'C3');
                $ejemplo->setCellValue('A5', "Así: {$tela->nombre} {$color->nombre}, un rollo de 50 m y dos rollos de 80 m (210 m en total). Una fila por cada metraje.");
                $ejemplo->getStyle('A5')->getFont()->setItalic(true);
                foreach (range('A', $ultima) as $columna) {
                    $ejemplo->getColumnDimension($columna)->setWidth(20);
                }
            }
        }

        // Hoja 3: cómo llenarla.
        $ayuda = $libro->createSheet();
        $ayuda->setTitle('Cómo llenar');
        $texto = $tipo === 'salida'
            ? [
                ['Salida de inventario: lo que se resta del almacén'],
                ['Una fila por rollo (telas) o por producto (lo demás). No cambies los títulos de la hoja "Detalle".'],
                ['TELAS: escribe el "Código del rollo" (está en la hoja "Rollos y productos"). "Metros a restar" vacío saca el rollo entero; con un número, solo ese corte.'],
                ['LO DEMÁS (sin rollos): escribe el código del producto y, en "Metros a restar", cuántas unidades se restan (en lo que dice la hoja "Rollos y productos").'],
                ['Costo es opcional: vacío usa el costo del catálogo (por metro en telas, por unidad en lo demás).'],
                ['Al cargar el archivo se agregan las líneas a la tabla del ajuste; ahí se revisan y se guarda.'],
            ]
            : [
                ['Entrada de inventario: lo que se suma al almacén'],
                ['Una fila por color (telas) o por producto (lo demás). No cambies los títulos de la hoja "Detalle".'],
                ['TELAS: el código del producto, el código del color, cuántos "Rollos" y los "Metros por rollo".'],
                ['Si los rollos de un color tienen distinto metraje, escribe UNA FILA POR CADA METRAJE. Ejemplo: NEGRO, 1 rollo de 50 m y otra fila NEGRO, 2 rollos de 80 m (mira la hoja "Ejemplo").'],
                ['LO DEMÁS (sin rollos): el código del producto y, en "Rollos", cuántas unidades entran (en lo que dice la hoja "Productos").'],
                ['Los códigos de producto y color están en la hoja "Productos". Costo es opcional: vacío usa el del catálogo.'],
                ['Al cargar el archivo se agregan las líneas a la tabla del ajuste; ahí se revisan y se guarda.'],
            ];
        $ayuda->fromArray($texto, null, 'A1');
        $ayuda->getStyle('A1')->getFont()->setBold(true);
        $ayuda->getColumnDimension('A')->setWidth(130);

        $libro->setActiveSheetIndex(0);
        $archivo = 'plantilla-ajuste-'.$tipo.'.xlsx';

        return response()->streamDownload(function () use ($libro) {
            (new Xlsx($libro))->save('php://output');
        }, $archivo, ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    }

    // ───────────────────────── lectura ─────────────────────────

    public function importar(Request $request)
    {
        $data = $request->validate([
            'archivo' => 'required|file|mimes:xlsx,xls|max:5120',
            'tipo' => 'required|in:entrada,salida',
            'almacen_id' => 'required|integer|exists:almacenes,id',
        ]);
        AlmacenAcceso::exigir((int) $data['almacen_id']);
        $tipo = $data['tipo'];

        try {
            $libro = IOFactory::load($request->file('archivo')->getRealPath());
        } catch (\Throwable) {
            return response()->json(['message' => 'No se pudo leer el archivo: ¿es un Excel válido?'], 422);
        }
        $hoja = $libro->getSheetByName('Detalle') ?? $libro->getSheet(0);
        $filas = $hoja->toArray(null, true, true, false);

        // La cabecera: la primera fila con los títulos de la plantilla.
        $mapa = [];
        $inicio = 0;
        foreach ($filas as $i => $fila) {
            $m = $this->mapa($fila);
            if (isset($m['producto'])) {
                $mapa = $m;
                $inicio = $i + 1;
                break;
            }
        }
        if (! $mapa) {
            return response()->json(['message' => 'No se encontró la fila de títulos. Usa la plantilla: la primera columna es "Producto".'], 422);
        }

        $valor = fn (array $fila, string $col) => isset($mapa[$col]) ? trim((string) ($fila[$mapa[$col]] ?? '')) : '';
        $numero = fn (string $v) => is_numeric(str_replace(',', '.', $v)) ? (float) str_replace(',', '.', $v) : null;

        $productos = Producto::query()->where('activo', true)
            ->with(['presentaciones' => fn ($q) => $q->where('activo', true)->with('unidadBase:id,abreviatura'), 'colores' => fn ($q) => $q->where('activo', true)])
            ->get();
        $porCodigo = $productos->keyBy(fn ($p) => $this->norm((string) $p->codigo));
        $porNombre = $productos->keyBy(fn ($p) => $this->norm((string) $p->nombre));

        $items = [];
        $errores = [];
        $rollosUsados = [];
        $leidas = 0;

        foreach (array_slice($filas, $inicio, self::MAX_FILAS, true) as $i => $fila) {
            $n = $i + 1; // el número que ve quien abre el Excel
            if (collect($fila)->filter(fn ($c) => trim((string) $c) !== '')->isEmpty()) {
                continue;
            }
            $leidas++;
            $falla = function (string $mensaje) use (&$errores, $n) {
                $errores[] = ['fila' => $n, 'mensaje' => $mensaje];
            };

            $costoTexto = $valor($fila, 'costo');
            $costoDado = $costoTexto === '' ? null : $numero($costoTexto);
            if ($costoTexto !== '' && $costoDado === null) {
                $falla("El costo \"{$costoTexto}\" no es un número.");
                continue;
            }

            // Salida de un rollo: lo identifica su código; no hace falta el producto.
            $codigoRollo = $tipo === 'salida' ? $valor($fila, 'codigo del rollo') : '';
            if ($codigoRollo !== '') {
                $rollo = AlmacenAcceso::limitar(Rollo::query())
                    ->where('codigo', $codigoRollo)
                    ->where('almacen_id', $data['almacen_id'])
                    ->first();
                if (! $rollo) {
                    $falla("El rollo \"{$codigoRollo}\" no está en este almacén.");
                    continue;
                }
                if ($rollo->estado !== Rollo::DISPONIBLE) {
                    $falla("El rollo \"{$codigoRollo}\" no está disponible (está {$rollo->estado}).");
                    continue;
                }
                if (isset($rollosUsados[$rollo->id])) {
                    $falla("El rollo \"{$codigoRollo}\" está repetido en el archivo (fila {$rollosUsados[$rollo->id]}).");
                    continue;
                }
                $max = (float) $rollo->metros_actual;
                $metrosTexto = $valor($fila, 'metros a restar');
                $metros = $metrosTexto === '' ? $max : $numero($metrosTexto);
                if ($metros === null || $metros <= 0) {
                    $falla("Los metros a restar del rollo \"{$codigoRollo}\" no son válidos.");
                    continue;
                }
                if ($metros > $max + 0.0001) {
                    $falla("El rollo \"{$codigoRollo}\" solo tiene {$max} m; pides {$metros} m.");
                    continue;
                }
                $producto = $productos->firstWhere('id', $rollo->producto_id);
                $rollosUsados[$rollo->id] = $n;
                $items[] = [
                    'tipo' => 'rollo',
                    'producto_id' => (string) $rollo->producto_id,
                    'color_id' => $rollo->producto_color_id ? (string) $rollo->producto_color_id : '',
                    'rollo_id' => (string) $rollo->id,
                    'rollo_codigo' => $rollo->codigo,
                    'rollo_max' => $max,
                    'metros' => $this->texto($metros),
                    'costo' => $costoDado !== null ? $this->texto($costoDado) : $this->texto($producto?->presentacionMetro()?->precio_compra),
                ];
                continue;
            }

            $clave = $valor($fila, 'producto');
            if ($clave === '') {
                $falla($tipo === 'salida' ? 'Escribe el código del rollo o el del producto.' : 'Falta el código del producto.');
                continue;
            }
            $producto = $porCodigo->get($this->norm($clave)) ?? $porNombre->get($this->norm($clave));
            if (! $producto) {
                $falla("No existe el producto \"{$clave}\".");
                continue;
            }
            $metro = $producto->presentacionMetro();

            // Una tela se ajusta por rollos: en la entrada, rollos y metros de un color; en la salida, por código de rollo.
            if ($metro) {
                if ($tipo === 'salida') {
                    $falla("\"{$producto->nombre}\" es una tela: la salida se hace por rollo. Escribe el código del rollo.");
                    continue;
                }
                $color = null;
                $colorTexto = $valor($fila, 'color');
                if ($producto->colores->isNotEmpty()) {
                    if ($colorTexto === '') {
                        $falla("\"{$producto->nombre}\": falta el color.");
                        continue;
                    }
                    $color = $producto->colores->first(fn ($c) => $this->norm((string) $c->codigo) === $this->norm($colorTexto))
                        ?? $producto->colores->first(fn ($c) => $this->norm((string) $c->nombre) === $this->norm($colorTexto));
                    if (! $color) {
                        $falla("\"{$producto->nombre}\": no existe el color \"{$colorTexto}\".");
                        continue;
                    }
                }
                $rollos = $numero($valor($fila, 'rollos'));
                $metros = $numero($valor($fila, 'metros por rollo'));
                if ($rollos === null || $rollos < 1 || floor($rollos) != $rollos) {
                    $falla("\"{$producto->nombre}\": los rollos deben ser un número entero mayor a 0.");
                    continue;
                }
                if ($metros === null || $metros <= 0) {
                    $falla("\"{$producto->nombre}\": indica los metros de cada rollo.");
                    continue;
                }
                $items[] = [
                    'tipo' => 'rollos',
                    'producto_id' => (string) $producto->id,
                    'color_id' => $color ? (string) $color->id : '',
                    'rollos' => (string) (int) $rollos,
                    'metros' => $this->texto($metros),
                    'costo' => $costoDado !== null ? $this->texto($costoDado) : $this->texto($metro->precio_compra),
                ];
                continue;
            }

            // Lo demás: producto, unidad y cantidad.
            // La cantidad sale de "Cantidad" (plantillas viejas) o, si no, de "Rollos" (entrada) / "Metros a restar" (salida).
            $unidadTexto = $valor($fila, 'unidad');
            $cantidad = $numero($valor($fila, 'cantidad'))
                ?? $numero($valor($fila, $tipo === 'salida' ? 'metros a restar' : 'rollos'));
            if ($cantidad === null || $cantidad <= 0) {
                $falla("\"{$producto->nombre}\": indica cuántas unidades ".($tipo === 'salida' ? 'se restan (columna "Metros a restar")' : 'entran (columna "Rollos")').'.');
                continue;
            }
            $presentaciones = $producto->presentaciones;
            // Sin unidad escrita se cuenta en la unidad base del producto (la menor).
            $pres = $unidadTexto === ''
                ? $this->presentacionBase($producto)
                : $presentaciones->first(fn ($p) => $this->norm((string) $p->nombre) === $this->norm($unidadTexto));
            if (! $pres) {
                $falla($unidadTexto === ''
                    ? "\"{$producto->nombre}\" no tiene unidades activas."
                    : "\"{$producto->nombre}\": no existe la unidad \"{$unidadTexto}\" (".$presentaciones->pluck('nombre')->implode(', ').').');
                continue;
            }
            // El mismo producto y unidad repetido en el archivo se suma en una sola línea.
            $existente = collect($items)->search(fn ($it) => $it['tipo'] === 'comun' && $it['producto_presentacion_id'] === (string) $pres->id);
            if ($existente !== false) {
                $items[$existente]['cantidad'] = $this->texto((float) $items[$existente]['cantidad'] + $cantidad);
                continue;
            }
            $items[] = [
                'tipo' => 'comun',
                'producto_id' => (string) $producto->id,
                'producto_presentacion_id' => (string) $pres->id,
                'cantidad' => $this->texto($cantidad),
                'costo' => $costoDado !== null ? $this->texto($costoDado) : $this->texto($pres->precio_compra),
            ];
        }

        return response()->json([
            'items' => $items,
            'errores' => $errores,
            'leidas' => $leidas,
        ]);
    }

    /** La unidad en la que se cuenta un producto que no es tela: su unidad base (la presentación de menor factor). */
    private function presentacionBase(Producto $producto)
    {
        return $producto->presentaciones->sortBy(fn ($p) => (float) $p->factor_conversion)->first();
    }

    /** Los títulos de la hoja → índice de columna, sin importar mayúsculas ni tildes. */
    private function mapa(array $fila): array
    {
        $mapa = [];
        foreach ($fila as $i => $celda) {
            $t = $this->norm((string) $celda);
            if ($t !== '') {
                $mapa[$t] = $i;
            }
        }

        return $mapa;
    }

    private function norm(string $texto): string
    {
        return (string) Str::of($texto)->ascii()->lower()->squish();
    }

    /** Sin ceros de relleno: 4.5, no 4.5000 (como arma los números la pantalla). */
    private function texto(mixed $n): string
    {
        return (float) $n > 0 ? rtrim(rtrim(number_format((float) $n, 4, '.', ''), '0'), '.') : '';
    }
}
