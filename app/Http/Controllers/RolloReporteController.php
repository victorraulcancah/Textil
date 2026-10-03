<?php

namespace App\Http\Controllers;

use App\Models\Almacen;
use App\Models\Empresa;
use App\Models\Producto;
use App\Models\ProductoColor;
use App\Models\Proveedor;
use App\Models\Rollo;
use App\Models\TipoTela;
use App\Pdf\PdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Reporte dinámico del stock de rollos: se eligen los filtros (tipo de tela, tela, color, almacén, estado,
 * proveedor, metraje) y cómo agrupar (por rollo, color, tela, tipo de tela, almacén o proveedor). Sale en
 * pantalla, en Excel y en PDF, los tres con exactamente las mismas filas.
 */
class RolloReporteController extends Controller
{
    /** Cómo se puede agrupar el reporte. */
    private const AGRUPACIONES = [
        'rollo' => 'Detalle por rollo',
        'color' => 'Por tela y color',
        'tela' => 'Por tela',
        'tipo' => 'Por tipo de tela',
        'almacen' => 'Por almacén',
        'proveedor' => 'Por proveedor',
    ];

    /** Los estados que cuentan como "en stock": lo que sigue en el almacén. */
    private const EN_STOCK = [Rollo::DISPONIBLE, Rollo::SEPARADO, Rollo::EN_PREPARACION];

    /** Lo que se puede elegir en cada filtro. */
    public function opciones(): JsonResponse
    {
        $conRollos = Rollo::query()->select('producto_id', 'producto_color_id', 'almacen_id')->distinct()->get();
        $productoIds = $conRollos->pluck('producto_id')->unique();

        $telas = Producto::whereIn('id', $productoIds)->orderBy('nombre')->get(['id', 'codigo', 'nombre', 'tipo_tela_id']);
        $colores = ProductoColor::whereIn('id', $conRollos->pluck('producto_color_id')->filter()->unique())
            ->whereNotNull('color_id')->get(['color_id', 'nombre'])
            ->unique('color_id')->sortBy('nombre')->values();

        return response()->json([
            'tipos' => TipoTela::whereIn('id', $telas->pluck('tipo_tela_id')->filter()->unique())->orderBy('nombre')->get(['id', 'nombre']),
            'telas' => $telas->map(fn ($t) => ['id' => $t->id, 'nombre' => $t->nombre, 'codigo' => $t->codigo, 'tipo_tela_id' => $t->tipo_tela_id]),
            'colores' => $colores->map(fn ($c) => ['id' => $c->color_id, 'nombre' => $c->nombre]),
            'almacenes' => Almacen::whereIn('id', $conRollos->pluck('almacen_id')->unique())->orderBy('nombre')->get(['id', 'nombre']),
            'proveedores' => Proveedor::orderBy('nombre')->get(['id', 'nombre']),
            'estados' => collect(Rollo::ESTADOS)->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values(),
            'agrupaciones' => collect(self::AGRUPACIONES)->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values(),
        ]);
    }

    public function datos(Request $request): JsonResponse
    {
        return response()->json($this->construir($request));
    }

    public function excel(Request $request)
    {
        $reporte = $this->construir($request);
        $columnas = $reporte['columnas'];
        $ultima = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex(count($columnas));

        $libro = new Spreadsheet();
        $hoja = $libro->getActiveSheet();
        $hoja->setTitle('Stock de rollos');

        $hoja->setCellValue('A1', 'REPORTE DE STOCK DE ROLLOS — '.mb_strtoupper($reporte['agrupacion']));
        $hoja->getStyle('A1')->getFont()->setBold(true)->setSize(13);
        $hoja->setCellValue('A2', 'Filtros: '.($reporte['filtros'] ?: 'ninguno').' · Generado: '.now()->format('d/m/Y H:i'));
        $hoja->getStyle('A2')->getFont()->setItalic(true)->getColor()->setRGB('666666');

        $cabecera = 4;
        foreach ($columnas as $i => $col) {
            $hoja->setCellValue([$i + 1, $cabecera], $col['label']);
        }
        $estiloCabecera = $hoja->getStyle("A{$cabecera}:{$ultima}{$cabecera}");
        $estiloCabecera->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $estiloCabecera->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB(ltrim((string) config('theme.primary', '#2563eb'), '#'));
        $estiloCabecera->getAlignment()->setVertical(Alignment::VERTICAL_CENTER)->setHorizontal(Alignment::HORIZONTAL_CENTER);

        $fila = $cabecera + 1;
        foreach ($reporte['filas'] as $datos) {
            foreach ($columnas as $i => $col) {
                $valor = $datos[$col['key']] ?? '';
                $celda = [$i + 1, $fila];
                // Las cifras van como número para poder sumarlas en Excel.
                if (in_array($col['tipo'], ['entero', 'metros', 'dinero'], true) && is_numeric($valor)) {
                    $hoja->setCellValue($celda, (float) $valor);
                    $hoja->getStyle($celda)->getNumberFormat()->setFormatCode($col['tipo'] === 'entero' ? '#,##0' : '#,##0.00');
                    $hoja->getStyle($celda)->getAlignment()->setHorizontal(Alignment::HORIZONTAL_RIGHT);
                } else {
                    $hoja->setCellValueExplicit($celda, (string) $valor, \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
                }
            }
            $fila++;
        }

        // El total de lo que se ve: sumas reales de Excel, que acompañan al filtro de la hoja.
        $hoja->setCellValue("A{$fila}", 'TOTAL');
        foreach ($columnas as $i => $col) {
            if (in_array($col['tipo'], ['entero', 'metros', 'dinero'], true) && $col['sumar']) {
                $letra = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($i + 1);
                $hoja->setCellValue("{$letra}{$fila}", "=SUM({$letra}".($cabecera + 1).":{$letra}".($fila - 1).')');
                $hoja->getStyle("{$letra}{$fila}")->getNumberFormat()->setFormatCode($col['tipo'] === 'entero' ? '#,##0' : '#,##0.00');
            }
        }
        $hoja->getStyle("A{$fila}:{$ultima}{$fila}")->getFont()->setBold(true);
        $hoja->getStyle("A{$fila}:{$ultima}{$fila}")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('EEF2FF');

        foreach (range(1, count($columnas)) as $i) {
            $hoja->getColumnDimensionByColumn($i)->setAutoSize(true);
        }
        $hoja->freezePane('A'.($cabecera + 1));
        $hoja->setAutoFilter("A{$cabecera}:{$ultima}".($fila - 1));

        return response()->streamDownload(function () use ($libro) {
            (new Xlsx($libro))->save('php://output');
        }, 'stock-rollos-'.now()->format('Y-m-d').'.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    public function pdf(Request $request)
    {
        $reporte = $this->construir($request);

        $pdf = app(PdfService::class)->generarVista('pdf.reportes.stock-rollos', [
            'reporte' => $reporte,
            'empresa' => Empresa::query()->where('activa', true)->first() ?? Empresa::first(),
        ], 'a4h');

        $archivo = 'stock-rollos-'.now()->format('Y-m-d').'.pdf';

        return $request->boolean('descargar') ? $pdf->download($archivo) : $pdf->stream($archivo);
    }

    /**
     * Arma el reporte: filtros → rollos → filas agrupadas. Lo usan la pantalla, el Excel y el PDF.
     *
     * @return array{titulo:string,agrupacion:string,filtros:string,columnas:array,filas:array,totales:array}
     */
    private function construir(Request $request): array
    {
        $agrupar = array_key_exists($request->input('agrupar'), self::AGRUPACIONES) ? $request->input('agrupar') : 'color';
        $estado = (string) $request->input('estado', 'en_stock');

        $consulta = Rollo::query()
            ->with([
                'producto:id,codigo,nombre,tipo_tela_id', 'producto.tipoTela:id,nombre',
                'color:id,producto_id,color_id,nombre,codigo,proveedor_id', 'color.proveedor:id,nombre',
                'almacen:id,nombre',
                'recepcion:id,proveedor_id', 'recepcion.proveedor:id,nombre',
                'importacion:id,proveedor_id', 'importacion.proveedor:id,nombre',
                'ubicacion.padre.padre.padre.padre',
            ])
            ->when($request->filled('tipo_tela_id'), fn ($q) => $q->whereHas('producto', fn ($p) => $p->where('tipo_tela_id', $request->integer('tipo_tela_id'))))
            ->when($request->filled('producto_id'), fn ($q) => $q->where('producto_id', $request->integer('producto_id')))
            ->when($request->filled('color_id'), fn ($q) => $q->whereHas('color', fn ($c) => $c->where('color_id', $request->integer('color_id'))))
            ->when($request->filled('almacen_id'), fn ($q) => $q->where('almacen_id', $request->integer('almacen_id')))
            ->entreMetros($request->filled('metros_desde') ? (float) $request->input('metros_desde') : null, $request->filled('metros_hasta') ? (float) $request->input('metros_hasta') : null);

        // "En stock" (lo que sigue en el almacén) es lo normal; se puede pedir un estado concreto o todos.
        if ($estado === 'en_stock') {
            $consulta->whereIn('estado', self::EN_STOCK)->where('metros_actual', '>', 0);
        } elseif ($estado !== 'todos' && array_key_exists($estado, Rollo::ESTADOS)) {
            $consulta->where('estado', $estado);
        }

        $rollos = $consulta->orderBy('producto_id')->orderBy('producto_color_id')->orderBy('numero')->get();

        // El proveedor del rollo: el de la recepción o importación de donde vino; si no, el del color de la tela.
        $proveedorDe = fn (Rollo $r) => $r->recepcion?->proveedor?->nombre ?? $r->importacion?->proveedor?->nombre ?? $r->color?->proveedor?->nombre ?? '';

        if ($request->filled('proveedor_id')) {
            $nombre = Proveedor::find($request->integer('proveedor_id'))?->nombre;
            $rollos = $rollos->filter(fn (Rollo $r) => $nombre !== null && $proveedorDe($r) === $nombre)->values();
        }

        $valor = fn (Rollo $r) => round((float) $r->metros_actual * (float) $r->costo_unitario, 2);
        $tipoDe = fn (Rollo $r) => $r->producto?->tipoTela?->nombre ?? 'Sin tipo de tela';

        if ($agrupar === 'rollo') {
            $columnas = [
                $this->col('tipo', 'Tipo de tela'), $this->col('tela', 'Tela'), $this->col('color', 'Color'),
                $this->col('rollo', 'Rollo'), $this->col('metros', 'Metros', 'metros', true), $this->col('peso', 'Peso (kg)', 'metros', true),
                $this->col('estado', 'Estado'), $this->col('almacen', 'Almacén'), $this->col('ubicacion', 'Ubicación'),
                $this->col('proveedor', 'Proveedor'), $this->col('costo', 'Costo/m', 'dinero'), $this->col('valor', 'Valor', 'dinero', true),
            ];
            $filas = $rollos->map(fn (Rollo $r) => [
                'tipo' => $tipoDe($r), 'tela' => $r->producto?->nombre ?? '', 'color' => $r->color?->nombre ?? '',
                'rollo' => $r->codigo, 'metros' => (float) $r->metros_actual, 'peso' => (float) $r->peso_kg,
                'estado' => Rollo::ESTADOS[$r->estado] ?? $r->estado, 'almacen' => $r->almacen?->nombre ?? '',
                'ubicacion' => $r->ubicacionLegible(), 'proveedor' => $proveedorDe($r),
                'costo' => (float) $r->costo_unitario, 'valor' => $valor($r),
            ])->all();
        } else {
            [$claveDe, $etiquetas] = match ($agrupar) {
                'tela' => [fn (Rollo $r) => (string) $r->producto_id, ['tipo', 'tela']],
                'tipo' => [fn (Rollo $r) => $tipoDe($r), ['tipo']],
                'almacen' => [fn (Rollo $r) => (string) $r->almacen_id, ['almacen']],
                'proveedor' => [fn (Rollo $r) => $proveedorDe($r) ?: 'Sin proveedor', ['proveedor']],
                default => [fn (Rollo $r) => $r->producto_id.'-'.$r->producto_color_id, ['tipo', 'tela', 'color']],
            };
            $nombres = ['tipo' => 'Tipo de tela', 'tela' => 'Tela', 'color' => 'Color', 'almacen' => 'Almacén', 'proveedor' => 'Proveedor'];
            $columnas = [
                ...array_map(fn ($k) => $this->col($k, $nombres[$k]), $etiquetas),
                $this->col('rollos', 'Rollos', 'entero', true), $this->col('metros', 'Metros', 'metros', true), $this->col('valor', 'Valor', 'dinero', true),
            ];
            $filas = $rollos->groupBy($claveDe)->map(function ($grupo) use ($etiquetas, $tipoDe, $proveedorDe, $valor) {
                /** @var Rollo $r */
                $r = $grupo->first();
                $fila = [
                    'tipo' => $tipoDe($r), 'tela' => $r->producto?->nombre ?? '', 'color' => $r->color?->nombre ?? '',
                    'almacen' => $r->almacen?->nombre ?? '', 'proveedor' => $proveedorDe($r) ?: 'Sin proveedor',
                    'rollos' => $grupo->count(), 'metros' => round((float) $grupo->sum('metros_actual'), 2),
                    'valor' => round((float) $grupo->sum(fn ($x) => $valor($x)), 2),
                ];

                return $fila;
            })->sortBy(fn ($f) => mb_strtolower(implode(' ', array_map(fn ($k) => (string) $f[$k], $etiquetas))))->values()->all();
        }

        $totales = [
            'rollos' => $rollos->count(),
            'metros' => round((float) $rollos->sum('metros_actual'), 2),
            'valor' => round((float) $rollos->sum(fn ($x) => $valor($x)), 2),
        ];

        return [
            'titulo' => 'Reporte de stock de rollos',
            'agrupacion' => self::AGRUPACIONES[$agrupar],
            'agrupar' => $agrupar,
            'filtros' => $this->describirFiltros($request, $estado),
            'columnas' => $columnas,
            'filas' => $filas,
            'totales' => $totales,
        ];
    }

    private function col(string $key, string $label, string $tipo = 'texto', bool $sumar = false): array
    {
        return ['key' => $key, 'label' => $label, 'tipo' => $tipo, 'sumar' => $sumar, 'align' => $tipo === 'texto' ? 'left' : 'right'];
    }

    /** Los filtros aplicados, en texto: para el encabezado del Excel y del PDF. */
    private function describirFiltros(Request $request, string $estado): string
    {
        $partes = [];
        if ($request->filled('tipo_tela_id')) $partes[] = 'Tipo: '.TipoTela::find($request->integer('tipo_tela_id'))?->nombre;
        if ($request->filled('producto_id')) $partes[] = 'Tela: '.Producto::find($request->integer('producto_id'))?->nombre;
        if ($request->filled('color_id')) $partes[] = 'Color: '.ProductoColor::where('color_id', $request->integer('color_id'))->value('nombre');
        if ($request->filled('almacen_id')) $partes[] = 'Almacén: '.Almacen::find($request->integer('almacen_id'))?->nombre;
        if ($request->filled('proveedor_id')) $partes[] = 'Proveedor: '.Proveedor::find($request->integer('proveedor_id'))?->nombre;
        if ($request->filled('metros_desde') || $request->filled('metros_hasta')) {
            $partes[] = 'Metros: '.($request->input('metros_desde') ?: '0').' a '.($request->input('metros_hasta') ?: '∞');
        }
        $partes[] = 'Estado: '.match (true) {
            $estado === 'en_stock' => 'en stock',
            $estado === 'todos' => 'todos',
            default => mb_strtolower(Rollo::ESTADOS[$estado] ?? $estado),
        };

        return implode(' · ', array_filter($partes));
    }
}
