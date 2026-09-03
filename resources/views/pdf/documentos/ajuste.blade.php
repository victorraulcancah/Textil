@extends('pdf.layouts.' . $formato)

@section('titulo', 'Ajuste ' . $documento)

@section('contenido')
    @php
        $tipo = $esEntrada ? 'ENTRADA' : 'SALIDA';
        $estado = strtoupper((string) $ajuste->estado);
    @endphp

    @if ($formato === 'ticket')
        <x-pdf.titulo texto="AJUSTE DE INVENTARIO" :numero="$documento" formato="ticket" />
        <x-pdf.meta
            :items="[
                'Almacén' => $ajuste->almacen?->nombre,
                'Tipo' => $tipo,
                'Motivo' => $ajuste->motivo,
                'Fecha' => optional($ajuste->fecha)->format('d/m/Y'),
                'Registró' => $ajuste->usuarioSolicita?->name,
                'Estado' => $estado,
            ]"
            formato="ticket" />
        <x-pdf.items :filas="$filas" formato="ticket" />
        <x-pdf.totales
            :lineas="['Subtotal' => number_format($total, 2)]"
            :total="number_format($total, 2)"
            moneda="S/"
            :enLetras="$enLetras"
            formato="ticket" />
        @if ($ajuste->observaciones)<div class="muted">Obs.: {{ $ajuste->observaciones }}</div>@endif
    @else
        <x-pdf.encabezado :empresa="$empresa" titulo="AJUSTE DE INVENTARIO" :numero="$documento" />
        <x-pdf.meta
            :items="[
                'Almacén' => $ajuste->almacen?->nombre ?: '—',
                'Tipo' => $tipo,
                'Motivo' => $ajuste->motivo ?: '—',
                'Proveedor' => $ajuste->proveedor?->nombre ?: '—',
                'Fecha' => optional($ajuste->fecha)->format('d/m/Y'),
                'Registró' => $ajuste->usuarioSolicita?->name ?: '—',
                'Estado' => $estado,
            ]" />
        <x-pdf.items
            :columnas="[
                ['label' => 'Ítem', 'key' => 'n', 'width' => '32px'],
                ['label' => 'Código', 'key' => 'codigo', 'width' => '72px'],
                ['label' => 'Descripción', 'key' => 'producto'],
                ['label' => 'Unidad', 'key' => 'unidad', 'width' => '90px'],
                ['label' => 'Cant.', 'key' => 'cantidad', 'align' => 'right', 'width' => '60px'],
                ['label' => 'Costo', 'key' => 'costo', 'align' => 'right', 'width' => '72px'],
                ['label' => 'Subtotal', 'key' => 'subtotal', 'align' => 'right', 'width' => '80px'],
            ]"
            :filas="$filas"
            :minFilas="8" />
        <x-pdf.cierre
            :observaciones="$ajuste->observaciones"
            :lineas="['Subtotal' => number_format($total, 2)]"
            :total="number_format($total, 2)"
            moneda="S/"
            :enLetras="$enLetras" />
    @endif
@endsection
