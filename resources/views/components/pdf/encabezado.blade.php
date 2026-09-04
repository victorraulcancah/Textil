@props(['empresa', 'titulo', 'numero' => null, 'estado' => null])

@php
    // Logo subido por la empresa (storage/app/public). Sin logo, la cabecera
    // muestra el nombre comercial como marca de texto: no hay logo del sistema.
    $logoPath = $empresa?->logo ? public_path('storage/' . ltrim($empresa->logo, '/')) : null;
    $tieneLogo = $logoPath && file_exists($logoPath);
    $nombreEmpresa = $empresa->razon_social ?? $empresa->nombre_comercial ?? 'Mi Empresa';
    $marcaTexto = $empresa->nombre_comercial ?? $nombreEmpresa;
@endphp

{{-- Cabecera A4: logo | empresa (centrado) | recuadro RUC/tipo/número --}}
<table style="margin-bottom: 6px;">
    <tr>
        <td style="width: 150px; vertical-align: middle;">
            @if ($tieneLogo)
                <img src="{{ $logoPath }}" style="max-height: 54px; max-width: 145px;">
            @else
                <div class="strong upper" style="font-size: 17px; letter-spacing: 1px; color: {{ config('theme.primary') }};">{{ $marcaTexto }}</div>
            @endif
        </td>
        <td style="vertical-align: middle; text-align: center; padding: 0 8px;">
            <span class="strong" style="font-size: 14px; color: {{ config('theme.text') }};">{{ $nombreEmpresa }}</span><br>
            @if ($empresa?->direccion)<span class="upper" style="font-size: 9px;">{{ $empresa->direccion }}</span><br>@endif
            @if ($empresa?->telefono)<span class="muted">Cel: {{ $empresa->telefono }}</span>@endif
            @if ($empresa?->email)<br><span class="muted upper">Email: {{ $empresa->email }}</span>@endif
            @if ($empresa?->web)<br><span class="muted">Web: {{ $empresa->web }}</span>@endif
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
