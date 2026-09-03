@props(['observaciones' => null, 'lineas' => [], 'total', 'moneda' => 'S/', 'enLetras' => null])

@php
    // Solo A4. Bloque final: "SON: …" a todo el ancho y, debajo,
    // observaciones (izquierda) + totales (derecha).
    $lineas = collect($lineas)->filter(fn ($v) => $v !== null && $v !== '')->all();
@endphp

@if ($enLetras)
    <table class="marco" style="margin-bottom: 6px;">
        <tr><td><span class="strong">SON:</span> {{ $enLetras }}</td></tr>
    </table>
@endif

<table>
    <tr>
        <td style="vertical-align: top; padding-right: 8px;">
            <table class="marco">
                <tr><td>
                    <span class="strong upper" style="font-size: 8px;">Observaciones</span><br>
                    {{ $observaciones ?: '—' }}
                </td></tr>
            </table>
        </td>
        <td style="width: 240px; vertical-align: top;">
            <table class="totales">
                @foreach ($lineas as $label => $valor)
                    <tr>
                        <td class="lbl">{{ $label }}</td>
                        <td class="right" style="width: 100px;">{{ $moneda }} {{ $valor }}</td>
                    </tr>
                @endforeach
                <tr>
                    <td class="lbl tot">Total</td>
                    <td class="right tot strong">{{ $moneda }} {{ $total }}</td>
                </tr>
            </table>
        </td>
    </tr>
</table>
