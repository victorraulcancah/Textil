<?php

namespace App\Http\Controllers;

use App\Models\Empresa;
use App\Models\NotaVenta;
use App\Pdf\PdfService;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * El listado de proformas en Excel y en PDF, con los mismos filtros de la pantalla (estado, forma de pago, cliente,
 * almacén, vendedor y rango de fecha de emisión): las dos salidas llevan exactamente las mismas filas.
 */
class NotaVentaReporteController extends Controller
{
    public function excel(Request $request)
    {
        $reporte = $this->construir($request);
        $columnas = $reporte['columnas'];
        $ultima = Coordinate::stringFromColumnIndex(count($columnas));

        $libro = new Spreadsheet();
        $hoja = $libro->getActiveSheet();
        $hoja->setTitle('Proformas');

        $hoja->setCellValue('A1', 'PROFORMAS');
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

        // Los totales de lo emitido (las anuladas no suman), uno por moneda: no se mezclan soles con dólares.
        $fila++;
        foreach ($reporte['totales'] as $moneda => $t) {
            $hoja->setCellValue("A{$fila}", "TOTAL EMITIDO ({$moneda}) · {$t['cantidad']} proforma(s)");
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
        }, 'proformas-'.now()->format('Y-m-d').'.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    public function pdf(Request $request)
    {
        $reporte = $this->construir($request);

        $pdf = app(PdfService::class)->generarVista('pdf.reportes.proformas', [
            'reporte' => $reporte,
            'empresa' => Empresa::query()->where('activa', true)->first() ?? Empresa::first(),
        ], 'a4h');

        $archivo = 'proformas-'.now()->format('Y-m-d').'.pdf';

        return $request->boolean('descargar') ? $pdf->download($archivo) : $pdf->stream($archivo);
    }

    /**
     * Filtros → proformas → filas y totales. Lo usan el Excel y el PDF, así llevan lo mismo.
     *
     * @return array{filtros:string,columnas:array,filas:array,totales:array}
     */
    private function construir(Request $request): array
    {
        $f = $request->validate([
            'estado' => 'nullable|in:emitida,anulada',
            'tipo_pago' => 'nullable|in:contado,credito',
            'cliente_id' => 'nullable|integer',
            'almacen_id' => 'nullable|integer',
            'vendedor_id' => 'nullable|integer',
            'desde' => 'nullable|date',
            'hasta' => 'nullable|date',
        ]);

        $notas = NotaVenta::query()
            ->with(['cliente:id,nombre', 'almacen:id,nombre', 'vendedor:id,name', 'ordenVenta:id,serie,numero'])
            ->when(! empty($f['estado']), fn ($q) => $q->where('estado', $f['estado']))
            ->when(! empty($f['tipo_pago']), fn ($q) => $q->where('tipo_pago', $f['tipo_pago']))
            ->when(! empty($f['cliente_id']), fn ($q) => $q->where('cliente_id', $f['cliente_id']))
            ->when(! empty($f['almacen_id']), fn ($q) => $q->where('almacen_id', $f['almacen_id']))
            ->when(! empty($f['vendedor_id']), fn ($q) => $q->where('vendedor_id', $f['vendedor_id']))
            ->when(! empty($f['desde']), fn ($q) => $q->whereDate('fecha_emision', '>=', $f['desde']))
            ->when(! empty($f['hasta']), fn ($q) => $q->whereDate('fecha_emision', '<=', $f['hasta']))
            ->orderByDesc('fecha_emision')
            ->orderByDesc('id')
            ->get();

        $filas = $notas->values()->map(fn (NotaVenta $n, $i) => [
            'n' => $i + 1,
            'fecha' => $n->fecha_emision?->format('d/m/Y') ?? '',
            'documento' => "{$n->serie}-{$n->numero}",
            'cliente' => $n->cliente?->nombre ?? 'Clientes varios',
            'almacen' => $n->almacen?->nombre ?? '',
            'vendedor' => $n->vendedor?->name ?? '',
            'pedido' => $n->ordenVenta ? $n->ordenVenta->documento : 'Mostrador',
            'pago' => $n->tipo_pago === 'contado' ? 'Contado' : 'Crédito',
            'estado' => $n->estado === 'anulada' ? 'Anulada' : 'Emitida',
            'moneda' => $n->moneda ?: 'PEN',
            'total' => (float) $n->total,
        ])->all();

        // Lo emitido por moneda; una anulada no suma.
        $totales = [];
        foreach ($notas as $n) {
            if ($n->estado === 'anulada') {
                continue;
            }
            $m = $n->moneda ?: 'PEN';
            $totales[$m] ??= ['cantidad' => 0, 'total' => 0.0];
            $totales[$m]['cantidad']++;
            $totales[$m]['total'] = round($totales[$m]['total'] + (float) $n->total, 2);
        }

        return [
            'filtros' => $this->describirFiltros($f),
            'columnas' => [
                ['key' => 'n', 'label' => '#', 'tipo' => 'texto', 'align' => 'center'],
                ['key' => 'fecha', 'label' => 'Fecha', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'documento', 'label' => 'Proforma', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'cliente', 'label' => 'Cliente', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'almacen', 'label' => 'Almacén', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'vendedor', 'label' => 'Vendedor', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'pedido', 'label' => 'Pedido', 'tipo' => 'texto', 'align' => 'left'],
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
            $partes[] = 'Estado: '.($f['estado'] === 'anulada' ? 'Anulada' : 'Emitida');
        }
        if (! empty($f['tipo_pago'])) {
            $partes[] = 'Pago: '.($f['tipo_pago'] === 'contado' ? 'Contado' : 'Crédito');
        }
        if (! empty($f['cliente_id'])) {
            $partes[] = 'Cliente: '.(\App\Models\Cliente::whereKey($f['cliente_id'])->value('nombre') ?? $f['cliente_id']);
        }
        if (! empty($f['almacen_id'])) {
            $partes[] = 'Almacén: '.(\App\Models\Almacen::whereKey($f['almacen_id'])->value('nombre') ?? $f['almacen_id']);
        }
        if (! empty($f['vendedor_id'])) {
            $partes[] = 'Vendedor: '.(\App\Models\User::whereKey($f['vendedor_id'])->value('name') ?? $f['vendedor_id']);
        }

        return implode(' · ', $partes);
    }
}
