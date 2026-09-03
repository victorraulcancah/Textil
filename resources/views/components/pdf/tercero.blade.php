@props(['titulo', 'nombre', 'documento' => null, 'direccion' => null, 'telefono' => null, 'formato' => 'a4'])

@if ($formato === 'ticket')
    <table class="row">
        <tr>
            <td class="muted" style="width: 30%;">{{ $titulo }}</td>
            <td class="right strong">{{ $nombre }}</td>
        </tr>
        @if ($documento)
            <tr><td class="muted">Doc.</td><td class="right">{{ $documento }}</td></tr>
        @endif
    </table>
    <div class="sep"></div>
@else
    <div class="box" style="margin: 6px 0;">
        <span class="muted" style="text-transform: uppercase; font-size: 8px;">{{ $titulo }}</span><br>
        <span class="strong">{{ $nombre }}</span>
        @if ($documento) <span class="muted">· {{ $documento }}</span>@endif
        @if ($direccion)<br><span class="muted">{{ $direccion }}</span>@endif
        @if ($telefono)<br><span class="muted">Tel. {{ $telefono }}</span>@endif
    </div>
@endif
