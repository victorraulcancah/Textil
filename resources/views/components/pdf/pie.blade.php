@props(['observaciones' => null, 'pieLegal' => null, 'generadoEn' => null, 'formato' => 'a4'])

@if ($formato === 'ticket')
    @if ($observaciones)
        <div class="muted">Obs.: {{ $observaciones }}</div>
    @endif
    <div class="sep"></div>
    <div class="center muted" style="font-size: 8px;">
        @if ($generadoEn){{ $generadoEn->format('d/m/Y H:i') }}<br>@endif
        ¡Gracias por su preferencia!
    </div>
@else
    <table style="width: 100%;">
        <tr>
            <td class="muted">{{ $pieLegal }}</td>
            <td class="right muted pagina" style="width: 140px;"></td>
        </tr>
    </table>
@endif
