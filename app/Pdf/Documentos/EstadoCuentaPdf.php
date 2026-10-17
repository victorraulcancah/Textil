<?php

namespace App\Pdf\Documentos;

use App\Models\Cliente;
use App\Pdf\DocumentoPdf;
use App\Services\CreditoService;
use App\Services\EstadoCuentaService;

/**
 * El estado de cuenta de un cliente. El {id} de la ruta es el cliente; el
 * rango llega como ?desde=&hasta= (sin él, los últimos 90 días).
 */
class EstadoCuentaPdf implements DocumentoPdf
{
    private const SITUACION = [
        'vencida' => 'Vencida',
        'en_gracia' => 'En gracia',
        'vence_hoy' => 'Vence hoy',
        'por_vencer' => 'Por vencer',
        'al_dia' => 'Al día',
    ];

    public function __construct(private EstadoCuentaService $estados) {}

    public function vista(): string
    {
        return 'pdf.documentos.estado-cuenta';
    }

    public function formatos(): array
    {
        return ['a4'];
    }

    public function datos(int $id): array
    {
        $cliente = Cliente::findOrFail($id);
        $estado = $this->estados->armar($cliente, request()->query('desde'), request()->query('hasta'));

        $n = fn ($v) => number_format((float) $v, 2);
        $fecha = fn ($f) => \Carbon\Carbon::parse($f)->format('d/m/Y');

        $monedas = collect($estado['monedas'])->map(fn ($b) => [
            'moneda' => $b['moneda'],
            'simbolo' => CreditoService::SIMBOLO[$b['moneda']] ?? $b['moneda'],
            'saldo_inicial' => $n($b['saldo_inicial']),
            'cargos' => $n($b['cargos']),
            'abonos' => $n($b['abonos']),
            'saldo_final' => $n($b['saldo_final']),
            'filas' => collect($b['movimientos'])->map(fn ($m) => [
                'fecha' => $fecha($m['fecha']),
                'documento' => $m['documento'],
                'detalle' => $m['detalle'].(! empty($m['extra']) ? ' — '.$m['extra'] : ''),
                'cargo' => $m['cargo'] ? $n($m['cargo']) : '',
                'abono' => $m['abono'] ? $n($m['abono']) : '',
                'saldo' => $n($m['saldo']),
            ])->all(),
        ])->all();

        $cuotas = collect($estado['cuotas'])->map(fn ($c) => [
            'documento' => $c['documento'],
            'cuota' => $c['cuota'],
            'vence' => $fecha($c['vence']),
            'situacion' => self::SITUACION[$c['situacion']] ?? $c['situacion'],
            'saldo' => (CreditoService::SIMBOLO[$c['moneda']] ?? $c['moneda']).' '.$n($c['saldo']),
        ])->all();

        $r = $estado['resumen'];
        $simbolo = CreditoService::SIMBOLO[$r['moneda']] ?? $r['moneda'];
        $ind = $estado['indicadores'];
        $sol = CreditoService::SIMBOLO['PEN'] ?? 'S/';
        $dol = CreditoService::SIMBOLO['USD'] ?? 'US$';

        $anticipos = collect($estado['anticipos'])->map(fn ($a) => [
            'documento' => $a['documento'],
            'fecha' => $fecha($a['fecha']),
            'almacen' => $a['almacen'] ?? '—',
            'metodo' => $a['metodo'].($a['referencia'] ? ' · Op. '.$a['referencia'] : ''),
            'monto' => (CreditoService::SIMBOLO[$a['moneda']] ?? $a['moneda']).' '.$n($a['monto']),
            'aplicado' => (CreditoService::SIMBOLO[$a['moneda']] ?? $a['moneda']).' '.$n($a['aplicado']),
            'saldo' => (CreditoService::SIMBOLO[$a['moneda']] ?? $a['moneda']).' '.$n($a['saldo']),
        ])->all();

        return [
            'cliente' => $cliente,
            'documento' => $cliente->codigo ?: (string) $cliente->id,
            'desde' => $fecha($estado['desde']),
            'hasta' => $fecha($estado['hasta']),
            'linea' => ['Estado crediticio' => $r['estado']['etiqueta'] ?? null] + ($r['tiene_linea'] ? [
                'Línea de crédito' => "{$simbolo} ".$n($r['limite_total']),
                'Crédito disponible' => "{$simbolo} ".$n($r['disponible']),
                'Línea utilizada' => "{$simbolo} ".$n($ind['linea']['utilizada']).($ind['linea']['porcentaje'] !== null ? " ({$ind['linea']['porcentaje']}%)" : ''),
                'Condición' => $r['condicion_venta'] === 'credito' ? "Crédito a {$r['dias_credito']} días" : 'Contado',
            ] : ['Línea de crédito' => 'Sin línea']) + [
                'Deuda total soles' => "{$sol} ".$n($ind['deuda']['PEN']),
                'Deuda total dólares' => "{$dol} ".$n($ind['deuda']['USD']),
                'Deuda vencida' => "{$sol} ".$n($ind['vencido']['PEN']).($ind['vencido']['USD'] > 0 ? " + {$dol} ".$n($ind['vencido']['USD']) : ''),
                'Anticipos a favor' => "{$sol} ".$n($ind['anticipos']['PEN']).($ind['anticipos']['USD'] > 0 ? " + {$dol} ".$n($ind['anticipos']['USD']) : ''),
            ],
            'monedas' => $monedas,
            'cuotas' => $cuotas,
            'anticipos' => $anticipos,
        ];
    }

    public function archivo(int $id): string
    {
        $cliente = Cliente::findOrFail($id);

        return 'estado-cuenta-'.($cliente->codigo ?: $cliente->id);
    }
}
