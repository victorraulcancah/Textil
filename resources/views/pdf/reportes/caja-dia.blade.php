@extends('pdf.layouts.a4')

@section('titulo', 'Planilla de caja')

@section('contenido')
    @php
        $n = fn ($v) => number_format((float) $v, 2);
        $a = $r['apertura'];
        $cuadro = $r['cuadro'];
        // Los importes en dólares llevan su símbolo; los soles van solos, como en la planilla de referencia.
        $importe = fn ($monto, $moneda) => $monto === null ? '' : ($moneda === 'US$' ? 'US$ ' : '').$n($monto);

        // La planilla: una fila por movimiento, con las columnas de la planilla de cobranza.
        $columnas = [
            ['label' => 'Nro. recibo', 'key' => 'recibo', 'width' => '8%'],
            ['label' => 'Cliente / Proveedor', 'key' => 'nombre'],
            ['label' => 'Cobrador', 'key' => 'cobrador', 'width' => '7%'],
            ['label' => 'Cod', 'key' => 'cod', 'width' => '4%'],
            ['label' => 'Número', 'key' => 'documento', 'width' => '9%'],
            ['label' => 'T', 'key' => 'tipo_pago', 'width' => '2%'],
            ['label' => 'Banco', 'key' => 'banco', 'width' => '11%'],
            ['label' => 'N° operación', 'key' => 'operacion', 'width' => '8%'],
            ['label' => 'T/C', 'key' => 'tc', 'align' => 'right', 'width' => '5%'],
            ['label' => 'Planilla', 'key' => 'planilla', 'width' => '7%'],
            ['label' => 'Ingreso', 'key' => 'ingreso', 'align' => 'right', 'width' => '8%'],
            ['label' => 'Egreso', 'key' => 'egreso', 'align' => 'right', 'width' => '8%'],
        ];

        $filas = collect($r['movimientos'])->map(fn ($m) => [
            'recibo' => $m['recibo'],
            'nombre' => $m['nombre'].($m['rol'] ? ' ('.$m['rol'].')' : ''),
            'cobrador' => $m['cobrador'],
            'cod' => $m['cod'],
            'documento' => $m['documento'],
            'tipo_pago' => $m['tipo_pago'],
            'banco' => mb_substr($m['banco'], 0, 14),
            'operacion' => $m['operacion'],
            'tc' => $m['tc'] ? number_format($m['tc'], 4) : '',
            'planilla' => $m['planilla'],
            'ingreso' => $importe($m['ingreso'], $m['moneda']),
            'egreso' => $importe($m['egreso'], $m['moneda']),
        ])->all();
    @endphp

    <x-pdf.encabezado :empresa="$empresa" titulo="PLANILLA DE CAJA" rotuloNumero="Día" :numero="$r['dia']" />

    <x-pdf.meta
        :items="[
            'Caja' => ($a->caja?->codigo ? $a->caja->codigo.' · ' : '').$a->caja?->nombre,
            'Almacén' => $a->caja?->almacen?->nombre,
            'Responsable' => $a->usuario?->name,
            'Turnos' => $r['turnos'],
            'Movimientos' => count($filas),
            'Impreso' => $generadoEn?->format('d/m/Y H:i'),
        ]" />

    @if (count($filas))
        <x-pdf.items :columnas="$columnas" :filas="$filas" />
    @else
        <table class="marco"><tr><td class="center muted" style="padding: 18px;">No hay movimientos ese día.</td></tr></table>
    @endif

    {{-- El cuadro del día por medio de pago, con el saldo anterior y el saldo en caja. --}}
    <table class="items" style="margin-top: 8px;">
        <thead>
            <tr>
                <th rowspan="2" style="width: 16%;"></th>
                @foreach ($cuadro['medios'] as $clave => $rotulo)
                    <th colspan="2" style="text-align: center;">{{ $rotulo }}</th>
                @endforeach
            </tr>
            <tr>
                @foreach ($cuadro['medios'] as $clave => $rotulo)
                    @foreach ($cuadro['monedas'] as $codigo => $simbolo)
                        <th style="text-align: right;">{{ $simbolo }}</th>
                    @endforeach
                @endforeach
            </tr>
        </thead>
        <tbody>
            @foreach ($cuadro['filas'] as $fila)
                <tr @if (in_array($fila['clave'], ['saldo_dia', 'saldo_caja'], true)) class="strong" style="background: #eef2ff;" @endif>
                    <td class="strong upper">{{ $fila['rotulo'] }}</td>
                    @foreach ($cuadro['medios'] as $clave => $rotulo)
                        @foreach ($cuadro['monedas'] as $codigo => $simbolo)
                            <td style="text-align: right;">{{ $n($fila['valores']["{$clave}.{$codigo}"]) }}</td>
                        @endforeach
                    @endforeach
                </tr>
            @endforeach
        </tbody>
    </table>

    <x-pdf.firmas :firmas="['Responsable de caja', 'Revisado por']" />
@endsection
