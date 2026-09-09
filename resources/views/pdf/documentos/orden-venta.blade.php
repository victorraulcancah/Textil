@extends('pdf.layouts.' . $formato)

@section('titulo', 'Pedido ' . $documento)

@section('contenido')
    @php
        $estado = strtoupper(\App\Models\OrdenVenta::ESTADOS[$orden->estado] ?? $orden->estado);
    @endphp

    <x-pdf.encabezado :empresa="$empresa" titulo="PEDIDO" :numero="$documento" />

    <x-pdf.tercero
        titulo="Cliente"
        :nombre="$orden->cliente?->nombre ?: 'Cliente varios'"
        :documento="$orden->cliente?->numero_documento"
        :direccion="$orden->cliente?->direccion"
        :telefono="$orden->cliente?->telefono" />

    <x-pdf.meta
        :items="[
            'Fecha' => optional($orden->fecha_emision)->format('d/m/Y'),
            'Entrega' => optional($orden->fecha_entrega)->format('d/m/Y') ?: '—',
            'Vendedor' => $orden->vendedor?->name ?: '—',
            'Estado' => $estado,
            'Requerimiento' => $orden->requerimiento_numero ?: '—',
            'Almacén' => $orden->almacen?->nombre ?: 'Lo define el almacén',
        ]" />

    <x-pdf.items
        :columnas="[
            ['label' => '#', 'key' => 'n', 'width' => '30px'],
            ['label' => 'Código', 'key' => 'codigo', 'width' => '70px'],
            ['label' => 'Producto', 'key' => 'producto'],
            ['label' => 'Presentación', 'key' => 'presentacion', 'width' => '110px'],
            ['label' => 'Cantidad', 'key' => 'cantidad', 'align' => 'right', 'width' => '70px'],
            ['label' => 'Metros', 'key' => 'metros', 'align' => 'right', 'width' => '70px'],
            ['label' => 'P. unit.', 'key' => 'precio', 'align' => 'right', 'width' => '70px'],
            ['label' => 'Importe', 'key' => 'importe', 'align' => 'right', 'width' => '80px'],
        ]"
        :filas="$filas"
        :minFilas="6" />

    <table class="marco" style="margin: 6px 0 14px 0;">
        <tr>
            <td class="strong upper" style="font-size: 9px;">Total de tela: {{ $total_metros }} m</td>
        </tr>
    </table>

    <x-pdf.totales
        :lineas="['Subtotal' => number_format((float) $orden->subtotal, 2), 'Descuento' => (float) $orden->descuento_total > 0 ? number_format((float) $orden->descuento_total, 2) : null]"
        :total="number_format((float) $orden->total, 2)"
        :moneda="$orden->moneda === 'USD' ? '$' : 'S/'" />

    {{-- Qué rollos concretos cubrieron el pedido. Solo aparece si el almacén
         ya los asignó: mientras tanto no existen. --}}
    @if (count($rollos))
        <div class="strong upper" style="font-size: 8px; margin: 14px 0 4px 0;">Rollos entregados</div>
        <x-pdf.items
            :columnas="[
                ['label' => 'Rollo', 'key' => 'codigo', 'width' => '120px'],
                ['label' => 'Producto', 'key' => 'producto'],
                ['label' => 'Color', 'key' => 'color', 'width' => '110px'],
                ['label' => 'Metros', 'key' => 'metros', 'align' => 'right', 'width' => '80px'],
            ]"
            :filas="$rollos" />
    @endif

    @if ($orden->observaciones)
        <table class="marco" style="margin-top: 12px;">
            <tr><td>
                <span class="strong upper" style="font-size: 8px;">Observaciones</span><br>
                {{ $orden->observaciones }}
            </td></tr>
        </table>
    @endif

    <div class="muted" style="font-size: 8px; margin-top: 10px;">
        Este documento registra lo que pidió el cliente; no descuenta inventario ni
        constituye comprobante de pago. La venta se formaliza con la nota de venta.
    </div>

    <x-pdf.firmas :firmas="['Vendedor', 'Cliente']" />
@endsection
