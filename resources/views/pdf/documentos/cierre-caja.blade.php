@extends('pdf.layouts.ticket')

@section('titulo', 'Cierre de caja ' . $documento)

@section('contenido')
    @php $m = 'S/'; @endphp

    <x-pdf.titulo texto="CIERRE DE CAJA" :numero="$documento" formato="ticket" />

    <x-pdf.meta
        :items="[
            'Caja' => $cierre->apertura?->caja?->nombre,
            'Responsable' => $cierre->apertura?->usuario?->name,
            'Apertura' => optional($cierre->apertura?->fecha_apertura)->format('d/m/Y H:i'),
            'Cierre' => optional($cierre->fecha_cierre)->format('d/m/Y H:i'),
            'Movimientos' => $movimientosCount,
        ]"
        formato="ticket" />

    <table class="row">
        <tr><td class="muted">Monto inicial</td><td class="right">{{ $m }} {{ number_format((float) $cierre->apertura?->monto_inicial, 2) }}</td></tr>
        <tr><td class="muted">Ingresos</td><td class="right">{{ $m }} {{ number_format($ingresos, 2) }}</td></tr>
        <tr><td class="muted">Egresos</td><td class="right">- {{ $m }} {{ number_format($egresos, 2) }}</td></tr>
    </table>
    <div class="sep"></div>

    <table class="row">
        <tr><td class="strong">Esperado (sistema)</td><td class="right strong">{{ $m }} {{ number_format((float) $cierre->monto_sistema, 2) }}</td></tr>
        <tr><td class="strong">Contado (arqueo)</td><td class="right strong">{{ $m }} {{ number_format((float) $cierre->monto_contado, 2) }}</td></tr>
        <tr>
            <td class="strong" style="font-size: 11px;">Diferencia</td>
            <td class="right strong" style="font-size: 11px;">{{ (float) $cierre->diferencia < 0 ? '-' : '' }}{{ $m }} {{ number_format(abs((float) $cierre->diferencia), 2) }}</td>
        </tr>
    </table>
    <div class="sep"></div>

    <div class="center muted">Firma del responsable</div>
    <div style="height: 26px;"></div>
    <div class="center">__________________________</div>
@endsection
