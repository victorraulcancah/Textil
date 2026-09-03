@extends('pdf.layouts.' . $formato)

@section('titulo', 'Recepción ' . $documento)

@section('contenido')
    @php
        $estadoLabel = [
            'pendiente' => 'PENDIENTE', 'parcial' => 'PARCIAL', 'completa' => 'COMPLETA',
            'recibida' => 'RECIBIDA', 'anulada' => 'ANULADA', 'deshecha' => 'DESHECHA',
        ];
        $estado = $estadoLabel[$recepcion->estado] ?? strtoupper((string) $recepcion->estado);
    @endphp

    @if ($formato === 'ticket')
        <x-pdf.titulo texto="RECEPCIÓN DE COMPRA" :numero="$documento" formato="ticket" />
        <x-pdf.tercero titulo="Proveedor" :nombre="$recepcion->proveedor?->nombre ?? '—'" :documento="$recepcion->proveedor?->ruc" formato="ticket" />
        <x-pdf.meta
            :items="[
                'Almacén' => $recepcion->almacen?->nombre,
                'Fecha' => optional($recepcion->fecha_recepcion)->format('d/m/Y'),
                'Compra' => $compraRef,
                'Recibe' => $recepcion->usuarioRecibe?->name,
                'Estado' => $estado,
            ]"
            formato="ticket" />
        <x-pdf.items :filas="$filas" formato="ticket" />
        @if ($recepcion->observaciones)<div class="muted">Obs.: {{ $recepcion->observaciones }}</div><div class="sep"></div>@endif
    @else
        <x-pdf.encabezado :empresa="$empresa" titulo="RECEPCIÓN DE COMPRA" :numero="$documento" />
        <x-pdf.meta
            :items="[
                'Proveedor' => $recepcion->proveedor?->nombre ?: '—',
                'RUC' => $recepcion->proveedor?->ruc ?: '—',
                'Almacén' => $recepcion->almacen?->nombre ?: '—',
                'Recibe' => $recepcion->usuarioRecibe?->name ?: '—',
                'F. recepción' => optional($recepcion->fecha_recepcion)->format('d/m/Y'),
                'Compra' => $compraRef ?: '—',
                'Orden' => $ordenRef ?: '—',
                'Estado' => $estado,
            ]" />
        <x-pdf.items
            :columnas="[
                ['label' => 'Ítem', 'key' => 'n', 'width' => '32px'],
                ['label' => 'Código', 'key' => 'codigo', 'width' => '72px'],
                ['label' => 'Descripción', 'key' => 'producto'],
                ['label' => 'Unidad', 'key' => 'unidad', 'width' => '90px'],
                ['label' => 'Pedida', 'key' => 'pedida', 'align' => 'right', 'width' => '60px'],
                ['label' => 'Recibida', 'key' => 'recibida', 'align' => 'right', 'width' => '62px'],
                ['label' => 'Conforme', 'key' => 'conforme', 'align' => 'right', 'width' => '65px'],
                ['label' => 'Rechazada', 'key' => 'rechazada', 'align' => 'right', 'width' => '68px'],
            ]"
            :filas="$filas"
            :minFilas="8" />
        <table class="marco" style="margin-bottom: 20px;">
            <tr><td>
                <span class="strong upper" style="font-size: 8px;">Observaciones</span><br>
                {{ $recepcion->observaciones ?: '—' }}
            </td></tr>
        </table>
        <x-pdf.firmas :firmas="['Entregado por (proveedor)', 'Recibido por']" formato="a4" />
    @endif
@endsection
