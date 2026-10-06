@props(['detalle' => null])

{{-- Lo que no se encontró al preparar el pedido y por tanto no se entregó: una línea por tela y color, con los códigos
     de los rollos que se mandaron a revisión (entre paréntesis), si los hubo. --}}
@php $lineas = collect(explode(';', (string) $detalle))->map(fn ($l) => trim($l))->filter()->values(); @endphp
@if ($lineas->isNotEmpty())
    <table class="marco" style="margin: 10px 0; border-color: #d97706;">
        <tr><td style="background: #fffbeb;">
            <span class="strong upper" style="font-size: 9px; color: #92400e;">NO ENCONTRADO · No se entregó</span>
            @foreach ($lineas as $l)
                <br><span style="font-size: 9px;">• {{ $l }}</span>
            @endforeach
        </td></tr>
    </table>
@endif
