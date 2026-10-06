<?php

namespace App\Http\Controllers;

use App\Models\Compra;
use App\Models\Empresa;
use App\Pdf\PdfService;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * El listado de compras en Excel y en PDF, con los mismos filtros de la pantalla (estado, forma de pago, proveedor y
 * rango de fecha): las dos salidas llevan exactamente las mismas filas.
 */
class CompraReporteController extends Controller
{
    private const ESTADOS = [
        'registrada' => 'Registrada',
        'parcial' => 'Recepción parcial',
        'recepcionada' => 'Recepcionada',
        'anulada' => 'Anulada',
    ];

    public function excel(Request $request)
    {
        $reporte = $this->construir($request);
        $columnas = $reporte['columnas'];
        $ultima = Coordinate::stringFromColumnIndex(count($columnas));

        $libro = new Spreadsheet();
        $hoja = $libro->getActiveSheet();
        $hoja->setTitle('Compras');

        $hoja->setCellValue('A1', 'COMPRAS');
        $hoja->getStyle('A1')->getFont()->setBold(true)->setSize(13);
        $hoja->setCellValue('A2', 'Filtros: '.($reporte['filtros'] ?: 'ninguno').' · Generado: '.now()->format('d/m/Y H:i'));
        $hoja->getStyle('A2')->getFont()->setItalic(true)->getColor()->setRGB('666666');

        $cabecera = 4;
        foreach ($columnas as $i => $col) {
            $hoja->setCellValue([$i + 1, $cabecera], $col['label']);
        }
        $estilo = $hoja->getStyle("A{$cabecera}:{$ultima}{$cabecera}");
        $estilo->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $estilo->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB(ltrim((string) config('theme.primary', '#2563eb'), '#'));
        $estilo->getAlignment()->setVertical(Alignment::VERTICAL_CENTER)->setHorizontal(Alignment::HORIZONTAL_CENTER);

        $fila = $cabecera + 1;
        foreach ($reporte['filas'] as $datos) {
            foreach ($columnas as $i => $col) {
                $valor = $datos[$col['key']] ?? '';
                $celda = [$i + 1, $fila];
                if ($col['tipo'] === 'dinero' && is_numeric($valor)) {
                    $hoja->setCellValue($celda, (float) $valor);
                    $hoja->getStyle($celda)->getNumberFormat()->setFormatCode('#,##0.00');
                    $hoja->getStyle($celda)->getAlignment()->setHorizontal(Alignment::HORIZONTAL_RIGHT);
                } else {
                    $hoja->setCellValueExplicit($celda, (string) $valor, DataType::TYPE_STRING);
                }
            }
            $fila++;
        }

        // Los totales de lo comprado (las anuladas no suman), uno por moneda: no se mezclan soles con dólares.
        $fila++;
        foreach ($reporte['totales'] as $moneda => $t) {
            $hoja->setCellValue("A{$fila}", "TOTAL ({$moneda}) · {$t['cantidad']} compra(s)");
            $col = Coordinate::stringFromColumnIndex(count($columnas));
            $hoja->setCellValue("{$col}{$fila}", (float) $t['total']);
            $hoja->getStyle("{$col}{$fila}")->getNumberFormat()->setFormatCode('#,##0.00');
            $hoja->getStyle("A{$fila}:{$col}{$fila}")->getFont()->setBold(true);
            $hoja->getStyle("A{$fila}:{$col}{$fila}")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('EEF2FF');
            $fila++;
        }

        foreach (range(1, count($columnas)) as $i) {
            $hoja->getColumnDimensionByColumn($i)->setAutoSize(true);
        }
        $hoja->freezePane('A'.($cabecera + 1));

        return response()->streamDownload(function () use ($libro) {
            (new Xlsx($libro))->save('php://output');
        }, 'compras-'.now()->format('Y-m-d').'.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    public function pdf(Request $request)
    {
        $reporte = $this->construir($request);

        $pdf = app(PdfService::class)->generarVista('pdf.reportes.compras', [
            'reporte' => $reporte,
            'empresa' => Empresa::query()->where('activa', true)->first() ?? Empresa::first(),
        ], 'a4h');

        $archivo = 'compras-'.now()->format('Y-m-d').'.pdf';

        return $request->boolean('descargar') ? $pdf->download($archivo) : $pdf->stream($archivo);
    }

    /**
     * Filtros → compras → filas y totales. Lo usan el Excel y el PDF, así llevan lo mismo.
     *
     * @return array{filtros:string,columnas:array,filas:array,totales:array}
     */
    private function construir(Request $request): array
    {
        $f = $request->validate([
            'estado' => 'nullable|in:'.implode(',', array_keys(self::ESTADOS)),
            'forma_pago' => 'nullable|in:contado,credito',
            'proveedor_id' => 'nullable|integer',
            'tipo_proveedor' => 'nullable|in:nacional,extranjero',
            'desde' => 'nullable|date',
            'hasta' => 'nullable|date',
        ]);

        $compras = Compra::query()
            ->with(['proveedor:id,nombre', 'ordenCompra:id,codigo,proveedor_id,numero_proveedor,fecha_emision', 'ordenCompra.proveedor:id,codigo_corto'])
            ->when(! empty($f['estado']), fn ($q) => $q->where('estado', $f['estado']))
            ->when(! empty($f['forma_pago']), fn ($q) => $q->where('forma_pago', $f['forma_pago']))
            ->when(! empty($f['proveedor_id']), fn ($q) => $q->where('proveedor_id', $f['proveedor_id']))
            ->when(! empty($f['tipo_proveedor']), fn ($q) => $q->whereHas('proveedor', fn ($p) => $p->where('tipo', $f['tipo_proveedor'])))
            ->when(! empty($f['desde']), fn ($q) => $q->whereDate('fecha', '>=', $f['desde']))
            ->when(! empty($f['hasta']), fn ($q) => $q->whereDate('fecha', '<=', $f['hasta']))
            ->orderByDesc('fecha')
            ->orderByDesc('id')
            ->get();

        $filas = $compras->values()->map(fn (Compra $c, $i) => [
            'n' => $i + 1,
            'fecha' => $c->fecha?->format('d/m/Y') ?? '',
            'compra' => $c->numero_compra ?? "#{$c->id}",
            'orden' => $c->ordenCompra?->codigo ?? '',
            'contrato' => $c->ordenCompra?->codigoDocumento() ?? '',
            'proveedor' => $c->proveedor?->nombre ?? '',
            'documento' => trim(ucfirst((string) $c->tipo_documento).' '.implode('-', array_filter([$c->serie, $c->numero]))),
            'pago' => $c->forma_pago === 'contado' ? 'Contado' : 'Crédito',
            'estado' => self::ESTADOS[$c->estado] ?? ucfirst((string) $c->estado),
            'moneda' => $c->moneda_origen ?: 'PEN',
            'total' => (float) $c->total,
        ])->all();

        // Lo comprado por moneda; una anulada no suma.
        $totales = [];
        foreach ($compras as $c) {
            if ($c->estado === 'anulada') {
                continue;
            }
            $m = $c->moneda_origen ?: 'PEN';
            $totales[$m] ??= ['cantidad' => 0, 'total' => 0.0];
            $totales[$m]['cantidad']++;
            $totales[$m]['total'] = round($totales[$m]['total'] + (float) $c->total, 2);
        }

        return [
            'filtros' => $this->describirFiltros($f),
            'columnas' => [
                ['key' => 'n', 'label' => '#', 'tipo' => 'texto', 'align' => 'center'],
                ['key' => 'fecha', 'label' => 'Fecha', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'compra', 'label' => 'Compra', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'orden', 'label' => 'Orden de compra', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'contrato', 'label' => 'N° contrato', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'proveedor', 'label' => 'Proveedor', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'documento', 'label' => 'Documento', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'pago', 'label' => 'Pago', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'estado', 'label' => 'Estado', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'moneda', 'label' => 'Moneda', 'tipo' => 'texto', 'align' => 'center'],
                ['key' => 'total', 'label' => 'Total', 'tipo' => 'dinero', 'align' => 'right'],
            ],
            'filas' => $filas,
            'totales' => $totales,
        ];
    }

    /** Los filtros en palabras, para el encabezado del reporte. */
    private function describirFiltros(array $f): string
    {
        $partes = [];
        if (! empty($f['desde']) || ! empty($f['hasta'])) {
            $d = ! empty($f['desde']) ? date('d/m/Y', strtotime($f['desde'])) : 'inicio';
            $h = ! empty($f['hasta']) ? date('d/m/Y', strtotime($f['hasta'])) : 'hoy';
            $partes[] = $d === $h ? "Fecha: {$d}" : "Fecha: {$d} al {$h}";
        }
        if (! empty($f['estado'])) {
            $partes[] = 'Estado: '.self::ESTADOS[$f['estado']];
        }
        if (! empty($f['forma_pago'])) {
            $partes[] = 'Pago: '.($f['forma_pago'] === 'contado' ? 'Contado' : 'Crédito');
        }
        if (! empty($f['tipo_proveedor'])) {
            $partes[] = 'Tipo de proveedor: '.ucfirst($f['tipo_proveedor']);
        }
        if (! empty($f['proveedor_id'])) {
            $partes[] = 'Proveedor: '.(\App\Models\Proveedor::whereKey($f['proveedor_id'])->value('nombre') ?? $f['proveedor_id']);
        }

        return implode(' · ', $partes);
    }
}
