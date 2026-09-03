@props(['empresa', 'titulo', 'numero' => null, 'estado' => null])

@php
    $logoPath = $empresa?->logo ? public_path('storage/' . ltrim($empresa->logo, '/')) : null;
    // Sin logo propio de la empresa se usa el del sistema (BRAVA).
    if (!$logoPath || !file_exists($logoPath)) {
        $logoPath = public_path('img/brava-horizontal.png');
    }
    $tieneLogo = $logoPath && file_exists($logoPath);
    $nombreEmpresa = $empresa->razon_social ?? $empresa->nombre_comercial ?? 'Mi Empresa';
@endphp

{{-- Cabecera A4: logo | empresa (centrado) | recuadro RUC/tipo/número --}}
<table style="margin-bottom: 6px;">
    <tr>
        <td style="width: 150px; vertical-align: middle;">
            @if ($tieneLogo)
                <img src="{{ $logoPath }}" style="max-height: 54px; max-width: 145px;">
            @endif
        </td>
        <td style="vertical-align: middle; text-align: center; padding: 0 8px;">
            <span class="strong" style="font-size: 14px; color: {{ config('theme.text') }};">{{ $nombreEmpresa }}</span><br>
            @if ($empresa?->direccion)<span class="upper" style="font-size: 9px;">{{ $empresa->direccion }}</span><br>@endif
            @if ($empresa?->telefono)<span class="muted">Cel: {{ $empresa->telefono }}</span>@endif
            @if ($empresa?->email)<br><span class="muted upper">Email: {{ $empresa->email }}</span>@endif
        </td>
        <td style="width: 205px; vertical-align: middle;">
            <table class="docbox">
                <tr><td>R.U.C. {{ $empresa?->ruc ?? '—' }}</td></tr>
                <tr><td class="hl">{{ $titulo }}</td></tr>
                <tr><td class="num">{{ $numero }}@if ($estado) <span class="muted" style="font-weight: normal;">({{ $estado }})</span>@endif</td></tr>
            </table>
        </td>
    </tr>
</table>
