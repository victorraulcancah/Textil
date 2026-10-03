<?php

namespace App\Http\Controllers;
use App\Support\AlmacenAcceso;

use App\Models\Cliente;
use App\Services\CreditoService;
use App\Services\EstadoCuentaService;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class EstadoCuentaController extends Controller
{
    private const SITUACION = [
        'vencida' => 'Vencida',
        'en_gracia' => 'En gracia',
        'vence_hoy' => 'Vence hoy',
        'por_vencer' => 'Por vencer',
        'al_dia' => 'Al día',
    ];

    public function __construct(protected EstadoCuentaService $estados) {}

    /**
     * Los clientes que alguna vez compraron a crédito, con lo que deben hoy
     * por moneda: para elegir de quién ver el estado de cuenta sin depender
     * del permiso de Clientes.
     */
    public function index()
    {
        $deudas = AlmacenAcceso::limitar(\App\Models\CuentaPorCobrar::query())->whereIn('estado', ['pendiente', 'parcial'])
            ->selectRaw('cliente_id, moneda, SUM(saldo) AS saldo')
            ->groupBy('cliente_id', 'moneda')
            ->get()
            ->groupBy('cliente_id');

        return response()->json(
            Cliente::whereHas('cuentasPorCobrar', fn ($q) => AlmacenAcceso::limitar($q))
                ->orderBy('nombre')
                ->get(['id', 'codigo', 'nombre', 'numero_documento'])
                ->map(fn (Cliente $c) => $c->only(['id', 'codigo', 'nombre', 'numero_documento']) + [
                    'deuda' => ($deudas->get($c->id) ?? collect())
                        ->mapWithKeys(fn ($d) => [$d->moneda => round((float) $d->saldo, 2)])
                        ->all(),
                ]),
        );
    }

    public function show(Request $request, Cliente $cliente)
    {
        $fechas = $this->fechas($request);

        return response()->json($this->estados->armar($cliente, $fechas['desde'] ?? null, $fechas['hasta'] ?? null));
    }

    /** El mismo estado de cuenta en Excel: una hoja por moneda y otra con las cuotas pendientes. */
    public function excel(Request $request, Cliente $cliente)
    {
        $fechas = $this->fechas($request);
        $estado = $this->estados->armar($cliente, $fechas['desde'] ?? null, $fechas['hasta'] ?? null);

        $libro = new Spreadsheet();
        $libro->removeSheetByIndex(0);

        $monedas = $estado['monedas'] ?: [['moneda' => $estado['resumen']['moneda'], 'saldo_inicial' => 0, 'cargos' => 0, 'abonos' => 0, 'saldo_final' => 0, 'movimientos' => []]];
        foreach ($monedas as $bloque) {
            $hoja = $libro->createSheet();
            $hoja->setTitle($bloque['moneda'] === 'USD' ? 'Dólares' : 'Soles');
            $simbolo = CreditoService::SIMBOLO[$bloque['moneda']] ?? $bloque['moneda'];

            $hoja->fromArray([
                ['Estado de cuenta'],
                ['Cliente', $estado['cliente']['nombre']],
                ['Documento', trim(($estado['cliente']['tipo_documento'] ?? '').' '.($estado['cliente']['numero_documento'] ?? ''))],
                ['Desde', $estado['desde'], 'Hasta', $estado['hasta']],
                ['Moneda', $simbolo],
                [],
                ['Fecha', 'Documento', 'Detalle', 'Cargo', 'Abono', 'Saldo'],
                ['', '', 'Saldo anterior', null, null, $bloque['saldo_inicial']],
            ], null, 'A1', true); // estricto: un saldo en 0 también se escribe
            $hoja->getStyle('A1')->getFont()->setBold(true)->setSize(14);
            $hoja->getStyle('A7:F7')->getFont()->setBold(true);

            $fila = 9;
            foreach ($bloque['movimientos'] as $m) {
                $hoja->fromArray([
                    $m['fecha'], $m['documento'], $m['detalle'],
                    $m['cargo'] ?: null, $m['abono'] ?: null, $m['saldo'],
                ], null, "A{$fila}", true);
                $fila++;
            }
            $hoja->fromArray(['', '', 'Totales', $bloque['cargos'], $bloque['abonos'], $bloque['saldo_final']], null, "A{$fila}", true);
            $hoja->getStyle("A{$fila}:F{$fila}")->getFont()->setBold(true);
            $hoja->getStyle("D8:F{$fila}")->getNumberFormat()->setFormatCode('#,##0.00');

            foreach (range('A', 'F') as $col) {
                $hoja->getColumnDimension($col)->setAutoSize(true);
            }
        }

        $hoja = $libro->createSheet();
        $hoja->setTitle('Cuotas pendientes');
        $hoja->fromArray(['Documento', 'Cuota', 'Vence', 'Situación', 'Moneda', 'Monto', 'Pagado', 'Saldo'], null, 'A1');
        $hoja->getStyle('A1:H1')->getFont()->setBold(true);
        $fila = 2;
        foreach ($estado['cuotas'] as $c) {
            $hoja->fromArray([
                $c['documento'], $c['cuota'], $c['vence'], self::SITUACION[$c['situacion']] ?? $c['situacion'],
                $c['moneda'], $c['monto'], $c['pagado'], $c['saldo'],
            ], null, "A{$fila}", true);
            $fila++;
        }
        $hoja->getStyle("F2:H{$fila}")->getNumberFormat()->setFormatCode('#,##0.00');
        foreach (range('A', 'H') as $col) {
            $hoja->getColumnDimension($col)->setAutoSize(true);
        }

        $libro->setActiveSheetIndex(0);
        $archivo = 'estado-cuenta-'.($cliente->codigo ?: $cliente->id).'-'.now()->format('Y-m-d').'.xlsx';

        return response()->streamDownload(function () use ($libro) {
            (new Xlsx($libro))->save('php://output');
        }, $archivo, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function fechas(Request $request): array
    {
        return $request->validate([
            'desde' => 'nullable|date',
            'hasta' => 'nullable|date|after_or_equal:desde',
        ]);
    }
}
