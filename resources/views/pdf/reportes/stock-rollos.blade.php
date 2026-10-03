@extends('pdf.layouts.a4')

@section('titulo', $reporte['titulo'])

@section('contenido')
    @php
        $n = fn ($v, $d = 2) => number_format((float) $v, $d);
        $formato = function ($col, $valor) use ($n) {
            if (! is_numeric($valor)) return $valor;
            return match ($col['tipo']) {
                'entero' => $n($valor, 0),
                'metros' => $n($valor),
                'dinero' => 'S/ '.$n($valor),
                default => $valor,
            };
        };
    @endphp

    <x-pdf.encabezado :empresa="$empresa" titulo="STOCK DE ROLLOS" :numero="now()->format('d/m/Y')" />

    <table class="marco" style="margin-bottom: 8px;">
        <tr>
            <td style="width: 16%;" class="strong upper">Reporte</td>
            <td>: {{ $reporte['agrupacion'] }}</td>
            <td style="width: 12%;" class="strong upper">Rollos</td>
            <td style="width: 10%;">: {{ $n($reporte['totales']['rollos'], 0) }}</td>
            <td style="width: 12%;" class="strong upper">Metros</td>
            <td style="width: 14%;">: {{ $n($reporte['totales']['metros']) }} m</td>
        </tr>
        <tr>
            <td class="strong upper">Filtros</td>
            <td colspan="3">: {{ $reporte['filtros'] ?: 'ninguno' }}</td>
            <td class="strong upper">Valor</td>
            <td>: S/ {{ $n($reporte['totales']['valor']) }}</td>
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
                        <td style="text-align: {{ $col['align'] }};">{{ $formato($col, $fila[$col['key']] ?? '') }}</td>
                    @endforeach
                </tr>
            @empty
                <tr><td colspan="{{ count($reporte['columnas']) }}" class="center muted" style="padding: 18px;">No hay rollos con esos filtros.</td></tr>
            @endforelse
            @if (count($reporte['filas']))
                <tr class="strong" style="background: #eef2ff;">
                    @foreach ($reporte['columnas'] as $i => $col)
                        <td style="text-align: {{ $col['align'] }};">
                            @if ($i === 0) TOTAL
                            @elseif ($col['sumar']) {{ $formato($col, collect($reporte['filas'])->sum($col['key'])) }}
                            @endif
                        </td>
                    @endforeach
                </tr>
            @endif
        </tbody>
    </table>
@endsection
