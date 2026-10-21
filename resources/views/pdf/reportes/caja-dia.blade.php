@extends('pdf.layouts.a4')

@section('titulo', 'Planilla de caja')

@section('contenido')
    @php
        $n = fn ($v) => number_format((float) $v, 2);
        $a = $r['apertura'];
        $cuadro = $r['cuadro'];
    @endphp

    <x-pdf.encabezado :empresa="$empresa" titulo="PLANILLA DE CAJA DEL DÍA" :numero="$r['dia']" />

    <table class="marco" style="margin-bottom: 8px;">
        <tr>
            <td style="width: 10%;" class="strong upper">Caja</td>
            <td style="width: 30%;">: {{ ($a->caja?->codigo ? $a->caja->codigo.' · ' : '').$a->caja?->nombre }}</td>
            <td style="width: 12%;" class="strong upper">Almacén</td>
            <td style="width: 22%;">: {{ $a->caja?->almacen?->nombre ?? '—' }}</td>
            <td style="width: 12%;" class="strong upper">Responsable</td>
            <td>: {{ $a->usuario?->name ?? '—' }}</td>
        </tr>
        <tr>
            <td class="strong upper">Día</td>
            <td>: {{ $r['dia'] }}</td>
            <td class="strong upper">Turnos</td>
            <td>: {{ $r['turnos'] }}</td>
            <td class="strong upper">Movimientos</td>
            <td>: {{ count($r['movimientos']) }}</td>
        </tr>
    </table>

    {{-- La planilla: un renglón por movimiento. --}}
    <table class="items" style="margin-bottom: 10px;">
        <thead>
            <tr>
                <th style="width: 4%; text-align: center;">#</th>
                <th style="width: 6%;">Hora</th>
                <th style="width: 11%;">Nro. documento</th>
                <th style="width: 27%;">Cliente / Proveedor</th>
                <th style="width: 14%;">Referencia</th>
                <th style="width: 15%;">Tipo de pago</th>
                <th style="width: 9%;">N° operación</th>
                <th style="width: 5%; text-align: center;">Mon.</th>
                <th style="width: 9%; text-align: right;">Ingreso</th>
                <th style="width: 9%; text-align: right;">Egreso</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($r['movimientos'] as $m)
                <tr @if ($m['anulado']) style="color: #9ca3af;" @endif>
                    <td style="text-align: center;">{{ $m['n'] }}</td>
                    <td>{{ $m['hora'] }}</td>
                    <td>{{ $m['documento'] }}</td>
                    <td>
                        {{ $m['nombre'] }}
                        @if ($m['rol'])<span style="color: #6b7280; font-size: 8px;"> · {{ $m['rol'] }}</span>@endif
                    </td>
                    <td>{{ $m['referencia'] }}</td>
                    <td>{{ $m['medio'] }}</td>
                    <td>{{ $m['operacion'] }}</td>
                    <td style="text-align: center;">{{ $m['moneda'] }}</td>
                    <td style="text-align: right;">@if ($m['ingreso'] !== null){{ $n($m['ingreso']) }}@endif</td>
                    <td style="text-align: right;">@if ($m['egreso'] !== null){{ $n($m['egreso']) }}@endif</td>
                </tr>
            @empty
                <tr><td colspan="10" class="center muted" style="padding: 18px;">No hay movimientos ese día.</td></tr>
            @endforelse
        </tbody>
    </table>

    {{-- El cuadro del día por medio de pago: efectivo, cuenta, billetera, tarjeta y total, en soles y en dólares. --}}
    <table class="items">
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
@endsection
