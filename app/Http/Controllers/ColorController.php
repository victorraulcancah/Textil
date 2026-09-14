<?php

namespace App\Http\Controllers;

use App\Models\Color;
use Illuminate\Http\Request;

/**
 * El catálogo compartido de colores: se crea una vez y todas las telas lo
 * referencian, en vez de que cada producto tenga su propio "Camello" suelto.
 */
class ColorController extends Controller
{
    public function index()
    {
        return Color::orderBy('codigo')->get();
    }

    /**
     * El catálogo completo en Excel: para revisarlo fuera del sistema, o
     * como plantilla para editar y volver a cargar con "Cargar Excel" (las
     * mismas columnas "Código" y "Nombre" que espera esa importación).
     */
    public function exportarExcel()
    {
        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $hoja = $spreadsheet->getActiveSheet();
        $hoja->setTitle('Colores');
        $hoja->fromArray(['Código', 'Nombre', 'Estado'], null, 'A1');
        $hoja->getStyle('A1:C1')->getFont()->setBold(true);

        $fila = 2;
        foreach (Color::orderBy('codigo')->get() as $color) {
            $hoja->fromArray([$color->codigo, $color->nombre, $color->activo ? 'Activo' : 'Inactivo'], null, "A{$fila}");
            $fila++;
        }
        foreach (['A', 'B', 'C'] as $col) {
            $hoja->getColumnDimension($col)->setAutoSize(true);
        }

        $archivo = 'colores-'.now()->format('Y-m-d').'.xlsx';

        return response()->streamDownload(function () use ($spreadsheet) {
            (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet))->save('php://output');
        }, $archivo, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:100',
            // Si no se manda, se asigna el siguiente libre.
            'codigo' => 'nullable|string|size:4|unique:colores,codigo',
            'hex' => 'nullable|string|max:7',
            'activo' => 'boolean',
        ]);

        $data['codigo'] = $data['codigo'] ?? Color::generarCodigo();

        return response()->json(Color::create($data), 201);
    }

    // El parámetro de ruta se llama "colore" (Laravel singulariza "colores" a
    // secas, igual que "almacenes" -> "almacene" en el resto del proyecto).
    public function update(Request $request, Color $colore)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:100',
            'hex' => 'nullable|string|max:7',
            'activo' => 'boolean',
        ]);

        $colore->update($data);

        return response()->json($colore);
    }

    /**
     * Carga masiva desde un Excel del cliente: una fila por color, con su
     * nombre y —si lo trae— su propio código de 4 dígitos (para respetar la
     * numeración que ya manejan en su catálogo original). Sin código, se le
     * asigna el siguiente libre, igual que al crear uno solo.
     *
     * Columnas esperadas por nombre de cabecera (cualquier orden): "Código"
     * y "Nombre" (o "Nombre del color").
     */
    public function importarExcel(Request $request)
    {
        $request->validate([
            'archivo' => 'required|file|mimes:xlsx,xls|max:5120',
        ]);

        try {
            $hoja = \PhpOffice\PhpSpreadsheet\IOFactory::load($request->file('archivo')->getRealPath())
                ->getActiveSheet();
        } catch (\Throwable $e) {
            return response()->json(['message' => 'No se pudo leer el archivo: ¿es un Excel válido?'], 422);
        }

        $filas = $hoja->toArray(null, true, true, false);
        if (count($filas) < 2) {
            return response()->json(['message' => 'El archivo no tiene filas de datos.'], 422);
        }

        $col = $this->mapaColumnas($filas[0]);
        if (! isset($col['nombre'])) {
            return response()->json([
                'message' => 'Falta la columna "Nombre" en el Excel. Se esperan: Código, Nombre.',
            ], 422);
        }

        $creados = 0;
        $advertencias = [];

        foreach (array_slice($filas, 1) as $i => $fila) {
            $numeroFila = $i + 2;
            $nombre = trim((string) ($fila[$col['nombre']] ?? ''));
            $codigo = isset($col['codigo']) ? trim((string) ($fila[$col['codigo']] ?? '')) : '';

            if ($nombre === '') {
                continue; // fila vacía, tolerada (así vienen las filas "por completar" del cliente)
            }

            if ($codigo !== '') {
                $codigo = str_pad($codigo, 4, '0', STR_PAD_LEFT);
                if (Color::where('codigo', $codigo)->exists()) {
                    $advertencias[] = "Fila {$numeroFila}: el código \"{$codigo}\" ya existe, se omite \"{$nombre}\".";
                    continue;
                }
            } else {
                $codigo = Color::generarCodigo();
            }

            Color::create(['codigo' => $codigo, 'nombre' => $nombre, 'activo' => true]);
            $creados++;
        }

        return response()->json(['creados' => $creados, 'advertencias' => $advertencias]);
    }

    /** Ubica las columnas "código" y "nombre" por el texto de su cabecera. */
    private function mapaColumnas(array $cabecera): array
    {
        $alias = [
            'codigo' => ['codigo', 'código', 'codigo de color', 'código de color'],
            'nombre' => ['nombre', 'color', 'nombre del color'],
        ];

        $normalizar = fn ($t) => strtolower(trim((string) preg_replace('/\s+/', ' ', str_replace(
            ['á', 'é', 'í', 'ó', 'ú'], ['a', 'e', 'i', 'o', 'u'], (string) $t
        ))));

        $mapa = [];
        foreach ($cabecera as $indice => $texto) {
            $texto = $normalizar($texto);
            foreach ($alias as $clave => $nombres) {
                if (in_array($texto, $nombres, true)) {
                    $mapa[$clave] = $indice;
                }
            }
        }

        return $mapa;
    }

    /** Solo se borra si ninguna tela lo está usando: si no, se pierde la trazabilidad. */
    public function destroy(Color $colore)
    {
        if ($colore->productoColores()->exists()) {
            return response()->json([
                'message' => "\"{$colore->nombre}\" ya está asignado a una o más telas: no se puede eliminar.",
            ], 409);
        }

        $colore->delete();

        return response()->json(['message' => 'Color eliminado']);
    }
}
