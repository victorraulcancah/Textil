{{--
    La planilla de telas del cliente: una tabla por tela y el TOTAL al final.
    Recibe lo que arma App\Pdf\PlanillaTela.

    grupos:    [['titulo', 'filas' => [...], 'rollos', 'metros', 'total'], ...]
    totales:   ['rollos', 'metros', 'total']
    moneda:    "S/" o "$"
    pendiente: hay rollos por separar (el total es parcial)
    precios:   con las columnas de precio (el pedido y la proforma); sin ellas, el requerimiento del almacén
    colorCode: con la columna "Color code" (el código que se escribe en la orden de compra y la compra)
    conFactor: con la columna "Factor" (los metros de cada rollo); la orden de compra impresa no la lleva
    conTotal:  con la fila TOTAL al final (false cuando la planilla va partida entre otras cosas y el total se pone después)
--}}
@props(['grupos' => [], 'totales' => [], 'moneda' => 'S/', 'pendiente' => false, 'precios' => true, 'colorCode' => false, 'conTotal' => true, 'conFactor' => true])
@php
    $n = fn ($v) => rtrim(rtrim(number_format((float) $v, 2, '.', ''), '0'), '.');
    $celda = fn ($v) => is_numeric($v) ? $n($v) : ($v ?? '');
    $dinero = fn ($v) => is_numeric($v) ? $moneda.' '.number_format((float) $v, 2) : ($v ?? '');
    $borde = 'border: 1px solid #999; padding: 3px 5px; text-align: center;';

    // Columnas: Ítem, [Color code], Color, Rollo, Factor, Metros, [Precio unitario, Precio total].
    $titulos = ['Ítem'];
    $anchos = [];
    if ($colorCode) { $titulos[] = 'Color code'; }
    array_push($titulos, 'Color', 'Rollo');
    if ($conFactor) { $titulos[] = 'Factor'; }
    $titulos[] = 'Metros';
    if ($precios) { array_push($titulos, 'Precio unitario', 'Precio total'); }
    $anchos = match (true) {
        $precios && $colorCode => [14, 11, 15, 8, 9, 10, 16, 17],
        $precios => [17, 17, 9, 11, 12, 17, 17],
        $colorCode => [20, 16, 22, 10, 16, 16],
        default => [26, 26, 14, 17, 17],
    };
    // Sin Factor, su ancho se suma al de Color para que la tabla siga ocupando todo el ancho.
    if (! $conFactor) {
        $posFactor = $colorCode ? 4 : 3;
        $anchos[$posFactor - 2] += $anchos[$posFactor];
        array_splice($anchos, $posFactor, 1);
    }
    // Cuántas columnas ocupan "Sub total" / "Total" antes del rollo: Ítem [+ Color code] + Color.
    $antes = $colorCode ? 3 : 2;
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
                    <th style="{{ $borde }} background: {{ config('theme.primary') }}; color: #fff; font-size: 8px; text-transform: uppercase;">{{ $t }}</th>
                @endforeach
            </tr>
        </thead>
        <tbody>
            @foreach ($g['filas'] as $f)
                <tr>
                    <td style="{{ $borde }} font-size: 8px;">{{ $f['item'] }}</td>
                    @if ($colorCode)
                        <td style="{{ $borde }} font-size: 8px;">{{ $f['color_code'] ?? '' }}</td>
                    @endif
                    <td style="{{ $borde }} text-transform: uppercase;">{{ $f['color'] }}</td>
                    <td style="{{ $borde }}">{{ $f['rollo'] }}</td>
                    @if ($conFactor)
                        <td style="{{ $borde }}">{{ $celda($f['factor']) }}</td>
                    @endif
                    <td style="{{ $borde }}">{{ $celda($f['metros']) }}</td>
                    @if ($precios)
                        <td style="{{ $borde }}">{{ $f['precio'] === null ? 'Por confirmar' : $dinero($f['precio']) }}</td>
                        <td style="{{ $borde }}">{{ $dinero($f['total']) }}</td>
                    @endif
                </tr>
            @endforeach
            <tr class="strong upper">
                <td colspan="{{ $antes }}" style="padding: 3px 5px; border-bottom: 1px solid #999;">Sub total</td>
                <td style="padding: 3px 5px; text-align: center; border-bottom: 1px solid #999;">{{ $g['rollos'] ?: '' }}</td>
                @if ($conFactor)
                    <td style="border-bottom: 1px solid #999;"></td>
                @endif
                <td style="padding: 3px 5px; text-align: center; border-bottom: 1px solid #999;">{{ $g['metros'] ? $n($g['metros']) : '' }}</td>
                @if ($precios)
                    <td style="border-bottom: 1px solid #999;"></td>
                    <td style="padding: 3px 5px; text-align: center; border-bottom: 1px solid #999;">{{ $dinero($g['total']) }}</td>
                @endif
            </tr>
        </tbody>
    </table>
@endforeach

@if ($conTotal)
<table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 12px; border-top: 2px solid #666; border-bottom: 2px solid #666;">
    <colgroup>
        @foreach ($anchos as $a)<col style="width: {{ $a }}%">@endforeach
    </colgroup>
    <tr class="strong upper">
        <td colspan="{{ $antes }}" style="padding: 4px 5px;">Total{{ $pendiente ? ' (parcial: falta separar rollos)' : '' }}</td>
        <td style="padding: 4px 5px; text-align: center;">{{ ($totales['rollos'] ?? 0) ?: '' }}</td>
        @if ($conFactor)
            <td></td>
        @endif
        <td style="padding: 4px 5px; text-align: center;">{{ ($totales['metros'] ?? 0) ? $n($totales['metros']) : '' }}</td>
        @if ($precios)
            <td></td>
            <td style="padding: 4px 5px; text-align: center;">{{ $dinero($totales['total'] ?? 0) }}</td>
        @endif
    </tr>
</table>
@endif
