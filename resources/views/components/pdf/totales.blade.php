@props(['lineas' => [], 'total', 'moneda' => 'S/', 'enLetras' => null, 'formato' => 'a4'])

@php
    // $lineas: ['Subtotal' => '100.00', 'Descuento' => '-5.00'] (opcional).
    $lineas = collect($lineas)->filter(fn ($v) => $v !== null && $v !== '')->all();
@endphp

@if ($formato === 'ticket')
    <table class="row">
        @foreach ($lineas as $label => $valor)
            <tr><td class="muted">{{ $label }}</td><td class="right">{{ $moneda }} {{ $valor }}</td></tr>
        @endforeach
        <tr>
            <td class="strong" style="font-size: 11px;">TOTAL</td>
            <td class="right strong" style="font-size: 11px;">{{ $moneda }} {{ $total }}</td>
        </tr>
    </table>
    @if ($enLetras)<div class="muted center" style="margin-top: 3px;">Son: {{ $enLetras }}</div>@endif
    <div class="sep"></div>
@else
    <table style="margin: 4px 0;">
        <tr>
            <td>
                @if ($enLetras)
                    <div class="box" style="display: inline-block;">
                        <span class="muted">Son:</span> <span class="strong">{{ $enLetras }}</span>
                    </div>
                @endif
            </td>
            <td class="right" style="width: 240px;">
                <table>
                    @foreach ($lineas as $label => $valor)
                        <tr>
                            <td class="right muted">{{ $label }}</td>
                            <td class="right" style="width: 90px;">{{ $moneda }} {{ $valor }}</td>
                        </tr>
                    @endforeach
                    <tr>
                        <td class="right strong" style="font-size: 13px; color: {{ config('theme.warm') }};">TOTAL</td>
                        <td class="right strong" style="font-size: 13px; color: {{ config('theme.warm') }};">{{ $moneda }} {{ $total }}</td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
@endif
