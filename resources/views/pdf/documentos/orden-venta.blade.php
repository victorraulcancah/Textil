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

    {{-- La planilla del cliente: una tabla por tela, rollo por rollo (1R = rollo entero). --}}
    <x-pdf.planilla
        :grupos="$planilla['grupos']"
        :totales="$planilla['totales']"
        :moneda="$orden->moneda === 'USD' ? '$' : 'S/'"
        :pendiente="$porDefinir" />

    {{-- Lo que no se encontró y por tanto no se entregó. --}}
    <x-pdf.no-encontrado :detalle="$orden->saldo_detalle" />

    @unless ($porDefinir)
        <x-pdf.totales
            :lineas="['Subtotal' => number_format((float) $orden->subtotal, 2), 'Descuento' => (float) $orden->descuento_total > 0 ? number_format((float) $orden->descuento_total, 2) : null]"
            :total="number_format((float) $orden->total, 2)"
            :moneda="$orden->moneda === 'USD' ? '$' : 'S/'" />
    @endunless

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
        constituye comprobante de pago. La venta se formaliza con la proforma.
    </div>

    <x-pdf.firmas :firmas="['Vendedor', 'Cliente']" />
@endsection
