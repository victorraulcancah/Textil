@props(['empresa', 'formato' => 'a4'])

@php
    // El logo se guarda en storage/app/public; dompdf necesita la ruta física.
    $logoPath = $empresa?->logo ? public_path('storage/' . ltrim($empresa->logo, '/')) : null;
    // Sin logo propio de la empresa se usa el del sistema (BRAVA).
    if (!$logoPath || !file_exists($logoPath)) {
        $logoPath = public_path('img/brava-horizontal.png');
    }
    $tieneLogo = $logoPath && file_exists($logoPath);
@endphp

@if ($formato === 'ticket')
    {{-- El ticket no lleva logo: la térmica lo imprime pobre y ocupa papel. --}}
    <div class="center">
        <span class="strong">{{ $empresa->razon_social ?? $empresa->nombre_comercial ?? 'Mi Empresa' }}</span><br>
        @if ($empresa?->ruc)RUC {{ $empresa->ruc }}<br>@endif
        @if ($empresa?->direccion)<span class="muted">{{ $empresa->direccion }}</span><br>@endif
        @if ($empresa?->telefono)<span class="muted">Tel. {{ $empresa->telefono }}</span>@endif
    </div>
    <div class="sep"></div>
@else
    <table>
        <tr>
            <td style="width: 140px; vertical-align: top;">
                @if ($tieneLogo)
                    <img src="{{ $logoPath }}" style="max-height: 50px; max-width: 135px;">
                @endif
            </td>
            <td style="vertical-align: top;">
                <h2 class="strong" style="font-size: 13px; color: {{ config('theme.warm') }};">{{ $empresa->razon_social ?? $empresa->nombre_comercial ?? 'Mi Empresa' }}</h2>
                @if ($empresa?->nombre_comercial && $empresa?->razon_social)
                    <div class="muted">{{ $empresa->nombre_comercial }}</div>
                @endif
                <div>
                    @if ($empresa?->ruc)<span class="strong">RUC {{ $empresa->ruc }}</span>@endif
                    @if ($empresa?->direccion) · {{ $empresa->direccion }}@endif
                </div>
                <div class="muted">
                    @if ($empresa?->telefono)Tel. {{ $empresa->telefono }}@endif
                    @if ($empresa?->email) · {{ $empresa->email }}@endif
                </div>
            </td>
        </tr>
    </table>
@endif
