@extends('pdf.layouts.ticket')

@section('titulo', 'Movimiento de caja ' . $documento)

@section('contenido')
    @php $m = 'S/'; @endphp

    <x-pdf.titulo
        :texto="$esIngreso ? 'COMPROBANTE DE INGRESO' : 'COMPROBANTE DE EGRESO'"
        :numero="$documento"
        formato="ticket" />

    <x-pdf.meta
        :items="[
            'Caja' => $mov->apertura?->caja?->nombre,
            'Responsable' => $mov->apertura?->usuario?->name,
            'Fecha' => optional($mov->fecha)->format('d/m/Y'),
            'Motivo' => $mov->motivo?->nombre,
            'Método' => $metodoTexto,
            'Operación' => $mov->numero_operacion,
        ]"
        formato="ticket" />

    <table class="row">
        <tr>
            <td class="strong" style="font-size: 12px;">{{ $esIngreso ? 'INGRESO' : 'EGRESO' }}</td>
            <td class="right strong" style="font-size: 12px;">{{ $m }} {{ number_format((float) $mov->monto, 2) }}</td>
        </tr>
    </table>
    <div class="sep"></div>

    @if ($mov->descripcion)
        <div class="muted">Detalle:</div>
        <div>{{ $mov->descripcion }}</div>
        <div class="sep"></div>
    @endif

    <div class="center muted">Firma</div>
    <div style="height: 26px;"></div>
    <div class="center">__________________________</div>
@endsection
