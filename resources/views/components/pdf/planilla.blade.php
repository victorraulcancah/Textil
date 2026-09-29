{{--
    La planilla de telas del cliente: una tabla por tela y el TOTAL al final.
    Recibe lo que arma App\Pdf\PlanillaTela.

    grupos:    [['titulo', 'filas' => [...], 'rollos', 'metros', 'total'], ...]
    totales:   ['rollos', 'metros', 'total']
    moneda:    "S/" o "$"
    pendiente: hay rollos por separar (el total es parcial)
    precios:   con las columnas de precio (el pedido y la proforma); sin ellas, el requerimiento del almacén
--}}
@props(['grupos' => [], 'totales' => [], 'moneda' => 'S/', 'pendiente' => false, 'precios' => true])
@php
    $n = fn ($v) => rtrim(rtrim(number_format((float) $v, 2, '.', ''), '0'), '.');
    $celda = fn ($v) => is_numeric($v) ? $n($v) : ($v ?? '');
    $dinero = fn ($v) => is_numeric($v) ? $moneda.' '.number_format((float) $v, 2) : ($v ?? '');
    $borde = 'border: 1px solid #999; padding: 3px 5px; text-align: center;';
    $anchos = $precios ? [17, 17, 9, 11, 12, 17, 17] : [26, 26, 14, 17, 17];
    $titulos = $precios ? ['Ítem', 'Color', 'Rollo', 'Factor', 'Metros', 'Precio unitario', 'Precio total'] : ['Ítem', 'Color', 'Rollo', 'Factor', 'Metros'];
@endphp

@foreach ($grupos as $g)
    <div class="strong upper" style="font-size: 9px; margin: 10px 0 2px 0;">{{ $g['titulo'] }}</div>
    <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
        <colgroup>
            @foreach ($anchos as $a)<col style="width: {{ $a }}%">@endforeach
        </colgroup>
        <thead>
            <tr>
                @foreach ($titulos as $t)
                    <th style="{{ $borde }} background: #2563eb; color: #fff; font-size: 8px; text-transform: uppercase;">{{ $t }}</th>
                @endforeach
            </tr>
        </thead>
        <tbody>
            @foreach ($g['filas'] as $f)
                <tr>
                    <td style="{{ $borde }} font-size: 8px;">{{ $f['item'] }}</td>
                    <td style="{{ $borde }} text-transform: uppercase;">{{ $f['color'] }}</td>
                    <td style="{{ $borde }}">{{ $f['rollo'] }}</td>
                    <td style="{{ $borde }}">{{ $celda($f['factor']) }}</td>
                    <td style="{{ $borde }}">{{ $celda($f['metros']) }}</td>
                    @if ($precios)
                        <td style="{{ $borde }}">{{ $f['precio'] === null ? 'Por confirmar' : $dinero($f['precio']) }}</td>
                        <td style="{{ $borde }}">{{ $dinero($f['total']) }}</td>
                    @endif
                </tr>
            @endforeach
            <tr class="strong upper">
                <td colspan="2" style="padding: 3px 5px; border-bottom: 1px solid #999;">Sub total</td>
                <td style="padding: 3px 5px; text-align: center; border-bottom: 1px solid #999;">{{ $g['rollos'] ?: '' }}</td>
                <td style="border-bottom: 1px solid #999;"></td>
                <td style="padding: 3px 5px; text-align: center; border-bottom: 1px solid #999;">{{ $g['metros'] ? $n($g['metros']) : '' }}</td>
                @if ($precios)
                    <td style="border-bottom: 1px solid #999;"></td>
                    <td style="padding: 3px 5px; text-align: center; border-bottom: 1px solid #999;">{{ $dinero($g['total']) }}</td>
                @endif
            </tr>
        </tbody>
    </table>
@endforeach

<table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 12px; border-top: 2px solid #666; border-bottom: 2px solid #666;">
    <colgroup>
        @foreach ($anchos as $a)<col style="width: {{ $a }}%">@endforeach
    </colgroup>
    <tr class="strong upper">
        <td colspan="2" style="padding: 4px 5px;">Total{{ $pendiente ? ' (parcial: falta separar rollos)' : '' }}</td>
        <td style="padding: 4px 5px; text-align: center;">{{ ($totales['rollos'] ?? 0) ?: '' }}</td>
        <td></td>
        <td style="padding: 4px 5px; text-align: center;">{{ ($totales['metros'] ?? 0) ? $n($totales['metros']) : '' }}</td>
        @if ($precios)
            <td></td>
            <td style="padding: 4px 5px; text-align: center;">{{ $dinero($totales['total'] ?? 0) }}</td>
        @endif
    </tr>
</table>
