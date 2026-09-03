@extends('pdf.layouts.' . $formato)

@section('titulo', 'Guía de traslado ' . $documento)

@section('contenido')
    @php
        $estadoLabel = [
            'pendiente' => 'PENDIENTE', 'en_transito' => 'EN TRÁNSITO',
            'recibida' => 'RECIBIDA', 'cancelada' => 'CANCELADA',
        ];
        $estado = $estadoLabel[$guia->estado] ?? strtoupper((string) $guia->estado);
        $motivo = $guia->motivo?->nombre ?? $guia->motivo_traslado ?? '—';
        $transporte = $guia->modalidad_transporte === 'publico'
            ? ('Público' . ($guia->transportista_razon_social ? ' · ' . $guia->transportista_razon_social : ''))
            : ('Privado' . ($guia->vehiculo_placa ? ' · ' . $guia->vehiculo_placa : ''));
    @endphp

    @if ($formato === 'ticket')
        <x-pdf.titulo texto="GUÍA DE TRASLADO" :numero="$documento" formato="ticket" />
        <x-pdf.meta
            :items="[
                'Origen' => $guia->almacenOrigen?->nombre,
                'Destino' => $guia->almacenDestino?->nombre,
                'Motivo' => $motivo,
                'Fecha' => optional($guia->fecha_inicio_traslado)->format('d/m/Y'),
                'Transporte' => $transporte,
                'Conductor' => $guia->conductor_nombre,
                'Estado' => $estado,
            ]"
            formato="ticket" />
        <x-pdf.items :filas="$filas" formato="ticket" />
        @if ($guia->observaciones)<div class="muted">Obs.: {{ $guia->observaciones }}</div>@endif
    @else
        <x-pdf.encabezado :empresa="$empresa" titulo="GUÍA DE TRASLADO" :numero="$documento" />
        <x-pdf.meta
            :items="[
                'Origen' => $guia->almacenOrigen?->nombre ?: '—',
                'Destino' => $guia->almacenDestino?->nombre ?: '—',
                'Motivo' => $motivo,
                'F. inicio' => optional($guia->fecha_inicio_traslado)->format('d/m/Y'),
                'Transporte' => $transporte,
                'Conductor' => $guia->conductor_nombre ?: '—',
                'Bultos' => $guia->numero_bultos ?? '—',
                'Estado' => $estado,
            ]" />
        <x-pdf.items
            :columnas="[
                ['label' => 'Ítem', 'key' => 'n', 'width' => '32px'],
                ['label' => 'Código', 'key' => 'codigo', 'width' => '72px'],
                ['label' => 'Descripción', 'key' => 'producto'],
                ['label' => 'Unidad', 'key' => 'unidad', 'width' => '100px'],
                ['label' => 'Enviado', 'key' => 'enviado', 'align' => 'right', 'width' => '75px'],
                ['label' => 'Recibido', 'key' => 'recibido', 'align' => 'right', 'width' => '75px'],
            ]"
            :filas="$filas"
            :minFilas="8" />
        <table class="marco" style="margin-bottom: 20px;">
            <tr><td>
                <span class="strong upper" style="font-size: 8px;">Observaciones</span><br>
                {{ $guia->observaciones ?: '—' }}
            </td></tr>
        </table>
        <x-pdf.firmas :firmas="['Entregado por', 'Recibido por']" formato="a4" />
    @endif
@endsection
