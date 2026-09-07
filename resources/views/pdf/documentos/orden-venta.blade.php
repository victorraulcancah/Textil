@extends('pdf.layouts.' . $formato)

@section('titulo', 'Pedido ' . $documento)

@section('contenido')
    @php
        $estado = strtoupper(\App\Models\OrdenVenta::ESTADOS[$orden->estado] ?? $orden->estado);
        $totalRollos = $orden->detalles->count();
        $totalMetros = number_format((float) $orden->detalles->sum('metros'), 2);
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
            'Almacén' => $orden->almacen?->nombre ?: '—',
            'Vendedor' => $orden->vendedor?->name ?: '—',
            'Estado' => $estado,
            'Requerimiento' => $orden->requerimiento_numero ?: '—',
        ]" />

    {{-- Resumen por color: es como el cliente pide y como lo revisa. --}}
    <x-pdf.items
        :columnas="[
            ['label' => 'Tela', 'key' => 'producto'],
            ['label' => 'Color', 'key' => 'color', 'width' => '130px'],
            ['label' => 'Cód.', 'key' => 'codigo_color', 'width' => '60px'],
            ['label' => 'Rollos', 'key' => 'rollos', 'align' => 'right', 'width' => '60px'],
            ['label' => 'Metros', 'key' => 'metros', 'align' => 'right', 'width' => '80px'],
            ['label' => 'Importe', 'key' => 'importe', 'align' => 'right', 'width' => '85px'],
        ]"
        :filas="$grupos"
        :minFilas="4" />

    <table class="marco" style="margin: 6px 0 14px 0;">
        <tr>
            <td class="strong upper" style="font-size: 9px;">Total rollos: {{ $totalRollos }}</td>
            <td class="strong upper right" style="font-size: 9px;">Total metros: {{ $totalMetros }} m</td>
        </tr>
    </table>

    <x-pdf.totales
        :lineas="['Subtotal' => number_format((float) $orden->subtotal, 2), 'Descuento' => (float) $orden->descuento_total > 0 ? number_format((float) $orden->descuento_total, 2) : null]"
        :total="number_format((float) $orden->total, 2)"
        :moneda="$orden->moneda === 'USD' ? '$' : 'S/'" />

    {{-- Qué rollos concretos son. El cliente los compra por metraje, así que
         necesita saber que se lleva el 0001 de 55 m y no otro. --}}
    <div class="strong upper" style="font-size: 8px; margin: 14px 0 4px 0;">Detalle de rollos</div>
    <x-pdf.items
        :columnas="[
            ['label' => '#', 'key' => 'n', 'width' => '30px'],
            ['label' => 'Rollo', 'key' => 'codigo', 'width' => '120px'],
            ['label' => 'Color', 'key' => 'color'],
            ['label' => 'Metros', 'key' => 'metros', 'align' => 'right', 'width' => '80px'],
            ['label' => 'P. unit.', 'key' => 'precio', 'align' => 'right', 'width' => '75px'],
            ['label' => 'Importe', 'key' => 'importe', 'align' => 'right', 'width' => '85px'],
        ]"
        :filas="$filas" />

    @if ($orden->observaciones)
        <table class="marco" style="margin-top: 12px;">
            <tr><td>
                <span class="strong upper" style="font-size: 8px;">Observaciones</span><br>
                {{ $orden->observaciones }}
            </td></tr>
        </table>
    @endif

    <div class="muted" style="font-size: 8px; margin-top: 10px;">
        Este documento reserva la mercadería; no descuenta inventario ni constituye
        comprobante de pago. La venta se formaliza con la nota de venta.
    </div>

    <x-pdf.firmas :firmas="['Vendedor', 'Cliente']" />
@endsection
