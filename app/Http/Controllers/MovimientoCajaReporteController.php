<?php

namespace App\Http\Controllers;

use App\Models\Empresa;
use App\Models\MovimientoCaja;
use App\Pdf\PdfService;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Los movimientos de caja en Excel y en PDF, con los mismos filtros de la pantalla (tipo y rango de fecha) y la misma
 * visibilidad (cada quien ve las cajas de su almacén): las dos salidas llevan exactamente las mismas filas.
 */
class MovimientoCajaReporteController extends Controller
{
    public function excel(Request $request)
    {
        $reporte = $this->construir($request);
        $columnas = $reporte['columnas'];
        $ultima = Coordinate::stringFromColumnIndex(count($columnas));

        $libro = new Spreadsheet();
        $hoja = $libro->getActiveSheet();
        $hoja->setTitle('Movimientos de caja');

        $hoja->setCellValue('A1', 'MOVIMIENTOS DE CAJA');
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
                if ($col['tipo'] === 'dinero') {
                    if (is_numeric($valor)) {
                        $hoja->setCellValue($celda, (float) $valor);
                        $hoja->getStyle($celda)->getNumberFormat()->setFormatCode('#,##0.00');
                        $hoja->getStyle($celda)->getAlignment()->setHorizontal(Alignment::HORIZONTAL_RIGHT);
                    }
                } else {
                    $hoja->setCellValueExplicit($celda, (string) $valor, DataType::TYPE_STRING);
                }
            }
            $fila++;
        }

        // Lo movido por moneda: los soles no se mezclan con los dólares.
        $fila++;
        $ingreso = Coordinate::stringFromColumnIndex(count($columnas) - 1);
        $egreso = Coordinate::stringFromColumnIndex(count($columnas));
        foreach ($reporte['totales'] as $moneda => $t) {
            $hoja->setCellValue("A{$fila}", "TOTAL ({$moneda}) · {$t['cantidad']} movimiento(s) · Saldo ".number_format($t['ingresos'] - $t['egresos'], 2));
            $hoja->setCellValue("{$ingreso}{$fila}", (float) $t['ingresos']);
            $hoja->setCellValue("{$egreso}{$fila}", (float) $t['egresos']);
            $hoja->getStyle("{$ingreso}{$fila}:{$egreso}{$fila}")->getNumberFormat()->setFormatCode('#,##0.00');
            $hoja->getStyle("A{$fila}:{$egreso}{$fila}")->getFont()->setBold(true);
            $hoja->getStyle("A{$fila}:{$egreso}{$fila}")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('EEF2FF');
            $fila++;
        }

        foreach (range(1, count($columnas)) as $i) {
            $hoja->getColumnDimensionByColumn($i)->setAutoSize(true);
        }
        $hoja->freezePane('A'.($cabecera + 1));

        return response()->streamDownload(function () use ($libro) {
            (new Xlsx($libro))->save('php://output');
        }, 'movimientos-caja-'.now()->format('Y-m-d').'.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    public function pdf(Request $request)
    {
        $reporte = $this->construir($request);

        $pdf = app(PdfService::class)->generarVista('pdf.reportes.movimientos-caja', [
            'reporte' => $reporte,
            'empresa' => Empresa::query()->where('activa', true)->first() ?? Empresa::first(),
        ], 'a4h');

        $archivo = 'movimientos-caja-'.now()->format('Y-m-d').'.pdf';

        return $request->boolean('descargar') ? $pdf->download($archivo) : $pdf->stream($archivo);
    }

    /**
     * Filtros → movimientos → filas y totales. Lo usan el Excel y el PDF, así llevan lo mismo.
     *
     * @return array{filtros:string,columnas:array,filas:array,totales:array}
     */
    private function construir(Request $request): array
    {
        $f = $request->validate([
            'tipo' => 'nullable|in:ingreso,egreso',
            'caja_id' => 'nullable|integer',
            'desde' => 'nullable|date',
            'hasta' => 'nullable|date',
        ]);

        // La misma consulta de la pantalla (cajas visibles para quien pide), sin el tope de filas.
        $movs = app(MovimientoCajaController::class)->consulta($request)
            ->when(! empty($f['tipo']), fn ($q) => $q->where('tipo', $f['tipo']))
            ->get()
            ->sortBy([['fecha', 'asc'], ['id', 'asc']])
            ->values();

        $filas = $movs->map(fn (MovimientoCaja $m, $i) => [
            'n' => $i + 1,
            'fecha' => $m->fecha?->format('d/m/Y') ?? '',
            'hora' => $m->created_at?->timezone(config('app.timezone'))->format('H:i') ?? '',
            'caja' => $m->apertura?->caja ? trim(($m->apertura->caja->codigo ? $m->apertura->caja->codigo.' · ' : '').$m->apertura->caja->nombre) : '',
            'tipo' => $m->tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
            'motivo' => $m->motivo?->nombre ?? '',
            'descripcion' => (string) $m->descripcion,
            'metodo' => $m->cuentaBancaria
                ? 'Transf. · '.($m->cuentaBancaria->alias ?: $m->cuentaBancaria->numero_cuenta)
                : ($m->billetera ? $m->billetera->nombre : 'Efectivo'),
            'operacion' => (string) $m->numero_operacion,
            'moneda' => $m->moneda ?: 'PEN',
            'ingreso' => $m->tipo === 'ingreso' ? (float) $m->monto : null,
            'egreso' => $m->tipo === 'egreso' ? (float) $m->monto : null,
        ])->all();

        $totales = [];
        foreach ($movs as $m) {
            $moneda = $m->moneda ?: 'PEN';
            $totales[$moneda] ??= ['cantidad' => 0, 'ingresos' => 0.0, 'egresos' => 0.0];
            $totales[$moneda]['cantidad']++;
            $clave = $m->tipo === 'ingreso' ? 'ingresos' : 'egresos';
            $totales[$moneda][$clave] = round($totales[$moneda][$clave] + (float) $m->monto, 2);
        }

        return [
            'filtros' => $this->describirFiltros($f),
            'columnas' => [
                ['key' => 'n', 'label' => '#', 'tipo' => 'texto', 'align' => 'center'],
                ['key' => 'fecha', 'label' => 'Fecha', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'hora', 'label' => 'Hora', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'caja', 'label' => 'Caja', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'tipo', 'label' => 'Tipo', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'motivo', 'label' => 'Motivo', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'descripcion', 'label' => 'Descripción', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'metodo', 'label' => 'Método', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'operacion', 'label' => 'N° operación', 'tipo' => 'texto', 'align' => 'left'],
                ['key' => 'moneda', 'label' => 'Moneda', 'tipo' => 'texto', 'align' => 'center'],
                ['key' => 'ingreso', 'label' => 'Ingreso', 'tipo' => 'dinero', 'align' => 'right'],
                ['key' => 'egreso', 'label' => 'Egreso', 'tipo' => 'dinero', 'align' => 'right'],
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
        if (! empty($f['tipo'])) {
            $partes[] = 'Tipo: '.($f['tipo'] === 'ingreso' ? 'Ingresos' : 'Egresos');
        }
        if (! empty($f['caja_id'])) {
            $partes[] = 'Caja: '.(\App\Models\Caja::whereKey($f['caja_id'])->value('nombre') ?? $f['caja_id']);
        }

        return implode(' · ', $partes);
    }
}
