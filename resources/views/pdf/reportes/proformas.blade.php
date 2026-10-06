@extends('pdf.layouts.a4')

@section('titulo', 'Proformas')

@section('contenido')
    @php
        $n = fn ($v, $d = 2) => number_format((float) $v, $d);
    @endphp

    <x-pdf.encabezado :empresa="$empresa" titulo="PROFORMAS" :numero="now()->format('d/m/Y')" />

    <table class="marco" style="margin-bottom: 8px;">
        <tr>
            <td style="width: 12%;" class="strong upper">Filtros</td>
            <td>: {{ $reporte['filtros'] ?: 'ninguno' }}</td>
            <td style="width: 14%;" class="strong upper">Proformas</td>
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
                            @if ($col['tipo'] === 'dinero'){{ $n($fila[$col['key']] ?? 0) }}@else{{ $fila[$col['key']] ?? '' }}@endif
                        </td>
                    @endforeach
                </tr>
            @empty
                <tr><td colspan="{{ count($reporte['columnas']) }}" class="center muted" style="padding: 18px;">No hay proformas con esos filtros.</td></tr>
            @endforelse
            {{-- Lo emitido por moneda: las anuladas no suman y los soles no se mezclan con los dólares. --}}
            @foreach ($reporte['totales'] as $moneda => $t)
                <tr class="strong" style="background: #eef2ff;">
                    <td colspan="{{ count($reporte['columnas']) - 1 }}" style="text-align: right;">
                        TOTAL EMITIDO ({{ $moneda === 'USD' ? 'US$' : 'S/' }}) · {{ $t['cantidad'] }} proforma(s)
                    </td>
                    <td style="text-align: right;">{{ $n($t['total']) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>
@endsection
