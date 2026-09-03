@extends('pdf.layouts.' . $formato)

@section('titulo', 'Compra ' . $documento)

@section('contenido')
    @php
        $estado = $compra->finalizado ? 'FINALIZADA' : strtoupper((string) $compra->estado);
        $formaPago = ['contado' => 'Contado', 'credito' => 'Crédito'];
        $pagoTxt = $formaPago[$compra->forma_pago] ?? ucfirst((string) $compra->forma_pago);
    @endphp

    @if ($formato === 'ticket')
        <x-pdf.titulo texto="COMPRA" :numero="$documento" formato="ticket" />
        <x-pdf.tercero titulo="Proveedor" :nombre="$compra->proveedor?->nombre ?? '—'" :documento="$compra->proveedor?->ruc" formato="ticket" />
        <x-pdf.meta
            :items="[
                'Comprob.' => $tipoDocLabel . ' ' . $docProveedor,
                'Fecha' => optional($compra->fecha)->format('d/m/Y'),
                'Pago' => $pagoTxt,
                'Estado' => $estado,
            ]"
            formato="ticket" />
        <x-pdf.items :filas="$filas" formato="ticket" />
        <x-pdf.totales
            :lineas="[
                'Subtotal' => number_format((float) $compra->subtotal, 2),
                'Flete' => (float) $compra->flete > 0 ? number_format((float) $compra->flete, 2) : null,
            ]"
            :total="number_format($total, 2)"
            :moneda="$moneda"
            :enLetras="$enLetras"
            formato="ticket" />
        @if ($compra->observaciones)<div class="muted">Obs.: {{ $compra->observaciones }}</div>@endif
    @else
        <x-pdf.encabezado :empresa="$empresa" titulo="COMPRA" :numero="$documento" />
        <x-pdf.meta
            :items="[
                'Proveedor' => $compra->proveedor?->nombre ?: '—',
                'RUC' => $compra->proveedor?->ruc ?: '—',
                'Comprobante' => $tipoDocLabel . ' ' . $docProveedor,
                'Orden' => $compra->ordenCompra?->codigo ?: '—',
                'F. compra' => optional($compra->fecha)->format('d/m/Y'),
                'Forma pago' => $pagoTxt,
                'Vencimiento' => optional($compra->fecha_vencimiento)->format('d/m/Y') ?: '—',
                'Estado' => $estado,
            ]" />
        <x-pdf.items
            :columnas="[
                ['label' => 'Ítem', 'key' => 'n', 'width' => '32px'],
                ['label' => 'Código', 'key' => 'codigo', 'width' => '72px'],
                ['label' => 'Cant.', 'key' => 'cantidad', 'align' => 'right', 'width' => '55px'],
                ['label' => 'Unidad', 'key' => 'unidad', 'width' => '90px'],
                ['label' => 'Descripción', 'key' => 'producto'],
                ['label' => 'Costo', 'key' => 'precio', 'align' => 'right', 'width' => '72px'],
                ['label' => 'Subtotal', 'key' => 'subtotal', 'align' => 'right', 'width' => '80px'],
            ]"
            :filas="$filas"
            :minFilas="8" />
        <x-pdf.cierre
            :observaciones="$compra->observaciones"
            :lineas="[
                'Subtotal' => number_format((float) $compra->subtotal, 2),
                'Flete' => (float) $compra->flete > 0 ? number_format((float) $compra->flete, 2) : null,
            ]"
            :total="number_format($total, 2)"
            :moneda="$moneda"
            :enLetras="$enLetras" />
    @endif
@endsection
