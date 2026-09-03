@props(['texto', 'numero' => null, 'formato' => 'a4', 'estado' => null])

@if ($formato === 'ticket')
    <div class="center">
        <span class="strong" style="font-size: 11px;">{{ $texto }}</span><br>
        @if ($numero)<span class="strong">{{ $numero }}</span>@endif
        @if ($estado) <span class="muted">({{ $estado }})</span>@endif
    </div>
    <div class="sep"></div>
@else
    <table style="margin: 10px 0 6px;">
        <tr>
            <td>
                <h1 class="strong" style="font-size: 15px; color: {{ config('theme.warm') }};">{{ $texto }}</h1>
                @if ($estado)<span class="muted">Estado: {{ $estado }}</span>@endif
            </td>
            <td class="right" style="width: 200px;">
                @if ($numero)<span class="tag">{{ $numero }}</span>@endif
            </td>
        </tr>
    </table>
@endif
