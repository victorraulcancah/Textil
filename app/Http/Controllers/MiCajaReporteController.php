<?php

namespace App\Http\Controllers;

use App\Models\AperturaCaja;
use App\Models\Empresa;
use App\Models\MovimientoCaja;
use App\Pdf\PdfService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * El reporte de caja del día de quien la tiene abierta: el resumen (monto inicial, ingresos, gastos, efectivo
 * esperado y lo cobrado por medios digitales), lo movido por cada cuenta o billetera y todos los movimientos de la
 * apertura. Sale en PDF y en Excel con exactamente los mismos datos.
 */
class MiCajaReporteController extends Controller
{
    public function excel()
    {
        $r = $this->construir();
        $apertura = $r['apertura'];

        $libro = new Spreadsheet();
        $hoja = $libro->getActiveSheet();
        $hoja->setTitle('Caja del día');

        $hoja->setCellValue('A1', 'REPORTE DE CAJA — '.mb_strtoupper($apertura->caja?->nombre ?? ''));
        $hoja->getStyle('A1')->getFont()->setBold(true)->setSize(13);
        $hoja->setCellValue('A2', 'Responsable: '.($apertura->usuario?->name ?? '—')
            .' · Almacén: '.($apertura->caja?->almacen?->nombre ?? '—')
            .' · Apertura: '.$apertura->fecha_apertura?->format('d/m/Y H:i')
            .' · Generado: '.now()->format('d/m/Y H:i'));
        $hoja->getStyle('A2')->getFont()->setItalic(true)->getColor()->setRGB('666666');

        // ── Resumen ──
        $fila = 4;
        $hoja->setCellValue("A{$fila}", 'RESUMEN (S/)');
        $hoja->getStyle("A{$fila}")->getFont()->setBold(true);
        $fila++;
        foreach ($r['resumen_filas'] as [$rotulo, $valor, $negrita]) {
            $hoja->setCellValue("A{$fila}", $rotulo);
            $hoja->setCellValue("D{$fila}", (float) $valor);
            $hoja->getStyle("D{$fila}")->getNumberFormat()->setFormatCode('#,##0.00');
            if ($negrita) {
                $hoja->getStyle("A{$fila}:D{$fila}")->getFont()->setBold(true);
            }
            $fila++;
        }

        // ── Por cuenta o billetera ──
        $fila++;
        $hoja->setCellValue("A{$fila}", 'POR CUENTA O BILLETERA (S/)');
        $hoja->getStyle("A{$fila}")->getFont()->setBold(true);
        $fila++;
        $this->cabecera($hoja, $fila, ['Destino', '', '', 'Ingresos', 'Gastos']);
        $fila++;
        foreach ($r['destinos'] as $d) {
            $hoja->setCellValue("A{$fila}", $d['destino']);
            $hoja->setCellValue("D{$fila}", $d['ingresos']);
            $hoja->setCellValue("E{$fila}", $d['egresos']);
            $hoja->getStyle("D{$fila}:E{$fila}")->getNumberFormat()->setFormatCode('#,##0.00');
            $fila++;
        }

        // ── Movimientos ──
        $fila += 1;
        $hoja->setCellValue("A{$fila}", 'MOVIMIENTOS ('.count($r['movimientos']).')');
        $hoja->getStyle("A{$fila}")->getFont()->setBold(true);
        $fila++;
        $inicio = $fila;
        $this->cabecera($hoja, $fila, ['#', 'Hora', 'Tipo', 'Motivo', 'Descripción', 'Método', 'N° operación', 'Moneda', 'Ingreso', 'Gasto']);
        $fila++;
        foreach ($r['movimientos'] as $m) {
            $hoja->setCellValue("A{$fila}", $m['n']);
            $hoja->setCellValueExplicit("B{$fila}", $m['hora'], DataType::TYPE_STRING);
            $hoja->setCellValueExplicit("C{$fila}", $m['tipo'], DataType::TYPE_STRING);
            $hoja->setCellValueExplicit("D{$fila}", $m['motivo'], DataType::TYPE_STRING);
            $hoja->setCellValueExplicit("E{$fila}", $m['descripcion'], DataType::TYPE_STRING);
            $hoja->setCellValueExplicit("F{$fila}", $m['metodo'], DataType::TYPE_STRING);
            $hoja->setCellValueExplicit("G{$fila}", $m['operacion'], DataType::TYPE_STRING);
            $hoja->setCellValueExplicit("H{$fila}", $m['moneda'], DataType::TYPE_STRING);
            if ($m['ingreso'] !== null) {
                $hoja->setCellValue("I{$fila}", $m['ingreso']);
            }
            if ($m['egreso'] !== null) {
                $hoja->setCellValue("J{$fila}", $m['egreso']);
            }
            $hoja->getStyle("I{$fila}:J{$fila}")->getNumberFormat()->setFormatCode('#,##0.00');
            $fila++;
        }
        $hoja->freezePane('A'.($inicio + 1));

        foreach (range(1, 10) as $i) {
            $hoja->getColumnDimensionByColumn($i)->setAutoSize(true);
        }

        return response()->streamDownload(function () use ($libro) {
            (new Xlsx($libro))->save('php://output');
        }, 'caja-'.now()->format('Y-m-d').'.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    public function pdf(Request $request)
    {
        $r = $this->construir();

        $pdf = app(PdfService::class)->generarVista('pdf.reportes.caja-dia', [
            'r' => $r,
            'empresa' => Empresa::query()->where('activa', true)->first() ?? Empresa::first(),
        ], 'a4');

        $archivo = 'caja-'.now()->format('Y-m-d').'.pdf';

        return $request->boolean('descargar') ? $pdf->download($archivo) : $pdf->stream($archivo);
    }

    /** @param  list<string>  $titulos */
    private function cabecera($hoja, int $fila, array $titulos): void
    {
        foreach ($titulos as $i => $t) {
            $hoja->setCellValue([$i + 1, $fila], $t);
        }
        $ultima = Coordinate::stringFromColumnIndex(count($titulos));
        $estilo = $hoja->getStyle("A{$fila}:{$ultima}{$fila}");
        $estilo->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $estilo->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB(ltrim((string) config('theme.primary', '#2563eb'), '#'));
        $estilo->getAlignment()->setVertical(Alignment::VERTICAL_CENTER)->setHorizontal(Alignment::HORIZONTAL_CENTER);
    }

    /**
     * La apertura de quien consulta, su resumen, lo movido por destino y los movimientos en orden. Lo usan el PDF y el
     * Excel.
     */
    private function construir(): array
    {
        $user = auth('api')->user();
        $apertura = AperturaCaja::with(['caja:id,nombre,almacen_id', 'caja.almacen:id,nombre', 'usuario:id,name'])
            ->where('caja_id', $user?->cajaActual()?->id)
            ->where('estado', 'abierta')
            ->where('usuario_id', $user?->id)
            ->latest('fecha_apertura')
            ->first();

        if (! $apertura) {
            throw ValidationException::withMessages(['caja' => 'No tienes una caja abierta.']);
        }

        $resumen = app(MiCajaController::class)->resumen($apertura);

        $movs = MovimientoCaja::with(['motivo:id,nombre', 'cuentaBancaria:id,alias,numero_cuenta', 'billetera:id,nombre'])
            ->where('apertura_caja_id', $apertura->id)
            ->orderBy('created_at')->orderBy('id')
            ->get();

        $destinoDe = fn (MovimientoCaja $m) => $m->cuentaBancaria
            ? 'Cuenta · '.($m->cuentaBancaria->alias ?: $m->cuentaBancaria->numero_cuenta)
            : ($m->billetera ? 'Billetera · '.$m->billetera->nombre : 'Efectivo');

        $movimientos = $movs->values()->map(fn (MovimientoCaja $m, $i) => [
            'n' => $i + 1,
            'hora' => $m->created_at?->timezone(config('app.timezone'))->format('H:i') ?? '',
            'tipo' => $m->tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
            'motivo' => $m->motivo?->nombre ?? '',
            'descripcion' => (string) $m->descripcion,
            'metodo' => $destinoDe($m),
            'operacion' => (string) $m->numero_operacion,
            'moneda' => $m->moneda ?: 'PEN',
            'ingreso' => $m->tipo === 'ingreso' ? (float) $m->monto : null,
            'egreso' => $m->tipo === 'egreso' ? (float) $m->monto : null,
        ])->all();

        // Lo movido por cada cuenta, billetera o el efectivo (en soles: los dólares van en su bloque).
        $destinos = $movs->filter(fn ($m) => ($m->moneda ?: 'PEN') === 'PEN')
            ->groupBy($destinoDe)
            ->map(fn ($grupo, $destino) => [
                'destino' => $destino,
                'ingresos' => round((float) $grupo->where('tipo', 'ingreso')->sum('monto'), 2),
                'egresos' => round((float) $grupo->where('tipo', 'egreso')->sum('monto'), 2),
            ])
            ->sortBy(fn ($d) => $d['destino'] === 'Efectivo' ? '' : $d['destino'])
            ->values()->all();

        $filas = [
            ['Monto inicial', $resumen['monto_inicial'], false],
            ['Ingresos', $resumen['ingresos'], false],
            ['Gastos', $resumen['egresos'], false],
            ['Efectivo esperado en caja', $resumen['esperado'], true],
            ['Cobros digitales (transferencia, Yape, billetera)', $resumen['otros_ingresos'], false],
            ['Gastos pagados por medios digitales', $resumen['otros_egresos'], false],
        ];

        return [
            'apertura' => $apertura,
            'resumen' => $resumen,
            'resumen_filas' => $filas,
            'destinos' => $destinos,
            'movimientos' => $movimientos,
        ];
    }
}
