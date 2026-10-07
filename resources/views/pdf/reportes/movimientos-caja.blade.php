@extends('pdf.layouts.a4')

@section('titulo', 'Movimientos de caja')

@section('contenido')
    @php
        $n = fn ($v, $d = 2) => number_format((float) $v, $d);
    @endphp

    <x-pdf.encabezado :empresa="$empresa" titulo="MOVIMIENTOS DE CAJA" :numero="now()->format('d/m/Y')" />

    <table class="marco" style="margin-bottom: 8px;">
        <tr>
            <td style="width: 12%;" class="strong upper">Filtros</td>
            <td>: {{ $reporte['filtros'] ?: 'ninguno' }}</td>
            <td style="width: 14%;" class="strong upper">Movimientos</td>
            <td style="width: 10%;">: {{ count($reporte['filas']) }}</td>
        </tr>
    </table>

    <table class="items">
        <thead>
            <tr>
                @foreach ($reporte['columnas'] as $col)
                    <th style="text-align: {{ $col['align'] }};">{{ $col['label'] }}</th>
                @endforeach
            </tr>
        </thead>
        <tbody>
            @forelse ($reporte['filas'] as $fila)
                <tr>
                    @foreach ($reporte['columnas'] as $col)
                        <td style="text-align: {{ $col['align'] }};">
                            @if ($col['tipo'] === 'dinero')@if (($fila[$col['key']] ?? null) !== null){{ $n($fila[$col['key']]) }}@endif @else{{ $fila[$col['key']] ?? '' }}@endif
                        </td>
                    @endforeach
                </tr>
            @empty
                <tr><td colspan="{{ count($reporte['columnas']) }}" class="center muted" style="padding: 18px;">No hay movimientos con esos filtros.</td></tr>
            @endforelse
            {{-- Lo movido por moneda: los soles no se mezclan con los dólares. --}}
            @foreach ($reporte['totales'] as $moneda => $t)
                <tr class="strong" style="background: #eef2ff;">
                    <td colspan="{{ count($reporte['columnas']) - 2 }}" style="text-align: right;">
                        TOTAL ({{ $moneda === 'USD' ? 'US$' : 'S/' }}) · {{ $t['cantidad'] }} movimiento(s) · Saldo {{ $n($t['ingresos'] - $t['egresos']) }}
                    </td>
                    <td style="text-align: right;">{{ $n($t['ingresos']) }}</td>
                    <td style="text-align: right;">{{ $n($t['egresos']) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>
@endsection
