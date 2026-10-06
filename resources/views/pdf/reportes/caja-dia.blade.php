@extends('pdf.layouts.a4')

@section('titulo', 'Reporte de caja')

@section('contenido')
    @php
        $n = fn ($v) => number_format((float) $v, 2);
        $a = $r['apertura'];
        $res = $r['resumen'];
        $dol = $res['dolares'] ?? null;
    @endphp

    <x-pdf.encabezado :empresa="$empresa" titulo="REPORTE DE CAJA" :numero="now()->format('d/m/Y')" />

    <table class="marco" style="margin-bottom: 8px;">
        <tr>
            <td style="width: 14%;" class="strong upper">Caja</td>
            <td style="width: 36%;">: {{ $a->caja?->nombre }}</td>
            <td style="width: 14%;" class="strong upper">Almacén</td>
            <td>: {{ $a->caja?->almacen?->nombre ?? '—' }}</td>
        </tr>
        <tr>
            <td class="strong upper">Responsable</td>
            <td>: {{ $a->usuario?->name ?? '—' }}</td>
            <td class="strong upper">Apertura</td>
            <td>: {{ $a->fecha_apertura?->format('d/m/Y H:i') }}</td>
        </tr>
    </table>

    {{-- El resumen: lo que hay que cuadrar con el efectivo del cajón y lo que entró por medios digitales. --}}
    <table class="items" style="margin-bottom: 8px;">
        <thead>
            <tr><th style="text-align: left;">Resumen</th><th style="text-align: right; width: 22%;">S/</th></tr>
        </thead>
        <tbody>
            @foreach ($r['resumen_filas'] as [$rotulo, $valor, $negrita])
                <tr @if ($negrita) class="strong" style="background: #eef2ff;" @endif>
                    <td>{{ $rotulo }}</td>
                    <td style="text-align: right;">{{ $n($valor) }}</td>
                </tr>
            @endforeach
            @if ($dol)
                <tr><td>Ingresos en dólares</td><td style="text-align: right;">US$ {{ $n($dol['ingresos']) }}</td></tr>
                <tr><td>Egresos en dólares</td><td style="text-align: right;">US$ {{ $n($dol['egresos']) }}</td></tr>
                <tr class="strong" style="background: #eef2ff;"><td>Dólares esperados</td><td style="text-align: right;">US$ {{ $n($dol['esperado']) }}</td></tr>
            @endif
        </tbody>
    </table>

    @if (count($r['destinos']))
        <table class="items" style="margin-bottom: 8px;">
            <thead>
                <tr>
                    <th style="text-align: left;">Por cuenta o billetera</th>
                    <th style="text-align: right; width: 22%;">Ingresos</th>
                    <th style="text-align: right; width: 22%;">Gastos</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($r['destinos'] as $d)
                    <tr>
                        <td>{{ $d['destino'] }}</td>
                        <td style="text-align: right;">{{ $n($d['ingresos']) }}</td>
                        <td style="text-align: right;">{{ $n($d['egresos']) }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <table class="items">
        <thead>
            <tr>
                <th style="width: 6%; text-align: center;">#</th>
                <th style="width: 8%;">Hora</th>
                <th style="width: 9%;">Tipo</th>
                <th>Motivo / descripción</th>
                <th style="width: 20%;">Método</th>
                <th style="width: 13%; text-align: right;">Monto</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($r['movimientos'] as $m)
                @php
                    $simbolo = $m['moneda'] === 'USD' ? 'US$' : 'S/';
                    $monto = $m['ingreso'] ?? $m['egreso'];
                @endphp
                <tr>
                    <td style="text-align: center;">{{ $m['n'] }}</td>
                    <td>{{ $m['hora'] }}</td>
                    <td>{{ $m['tipo'] }}</td>
                    <td>
                        {{ $m['motivo'] }}
                        @if ($m['descripcion'])<br><span class="muted">{{ $m['descripcion'] }}</span>@endif
                        @if ($m['operacion'])<br><span class="muted">Op. {{ $m['operacion'] }}</span>@endif
                    </td>
                    <td>{{ $m['metodo'] }}</td>
                    <td style="text-align: right;">{{ $m['ingreso'] !== null ? '+' : '-' }} {{ $simbolo }} {{ $n($monto) }}</td>
                </tr>
            @empty
                <tr><td colspan="6" class="center muted" style="padding: 18px;">La caja todavía no tiene movimientos.</td></tr>
            @endforelse
        </tbody>
    </table>

    <div style="height: 34px;"></div>
    <table>
        <tr>
            <td style="width: 50%; text-align: center;">__________________________<br><span class="muted">Responsable de caja</span></td>
            <td style="width: 50%; text-align: center;">__________________________<br><span class="muted">V°B° Administración</span></td>
        </tr>
    </table>
@endsection
