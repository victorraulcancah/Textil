@props(['items' => [], 'formato' => 'a4'])

@php
    // Solo pares con valor real.
    $items = collect($items)->filter(fn ($v) => $v !== null && $v !== '')->all();
@endphp

@if ($formato === 'ticket')
    <table class="row">
        @foreach ($items as $label => $valor)
            <tr>
                <td class="muted">{{ $label }}</td>
                <td class="right">{{ $valor }}</td>
            </tr>
        @endforeach
    </table>
    <div class="sep"></div>
@else
    @php
        // Se reparten en dos columnas verticales (izq. / der.), como la
        // factura/boleta de referencia. La primera mitad va a la izquierda.
        $mitad = (int) ceil(count($items) / 2);
        $izqK = array_keys(array_slice($items, 0, $mitad, true));
        $izqV = array_values(array_slice($items, 0, $mitad, true));
        $derK = array_keys(array_slice($items, $mitad, null, true));
        $derV = array_values(array_slice($items, $mitad, null, true));
        $filas = max(count($izqK), count($derK));
    @endphp
    <table class="marco" style="margin-bottom: 6px;">
        @for ($i = 0; $i < $filas; $i++)
            <tr>
                <td class="strong upper" style="width: 13%;">{{ $izqK[$i] ?? '' }}</td>
                <td style="width: 37%;">{{ isset($izqV[$i]) ? ': ' . $izqV[$i] : '' }}</td>
                <td class="strong upper" style="width: 14%;">{{ $derK[$i] ?? '' }}</td>
                <td style="width: 36%;">{{ isset($derV[$i]) ? ': ' . $derV[$i] : '' }}</td>
            </tr>
        @endfor
    </table>
@endif
