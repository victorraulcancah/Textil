@extends('pdf.layouts.' . $formato)

@section('titulo', 'Nota de venta ' . $documento)

@section('contenido')
    @php
        $anulada = $venta->estado === 'anulada';
        $clienteNombre = $venta->cliente?->nombre ?? $venta->cliente?->razon_social ?? 'Clientes varios';
        $monedaTxt = $venta->moneda === 'USD' ? 'DÓLARES' : 'SOLES';
        $pagoTxt = collect($pagos)->map(fn ($p) => $p['metodo'] . ' ' . $moneda . ' ' . $p['monto'])->join(', ');
    @endphp

    @if ($formato === 'ticket')
        {{-- === TICKET (80mm) === --}}
        <x-pdf.titulo texto="NOTA DE VENTA" :numero="$documento" :estado="$anulada ? 'ANULADA' : null" formato="ticket" />

        <x-pdf.tercero titulo="Cliente" :nombre="$clienteNombre" :documento="$venta->cliente?->numero_documento" formato="ticket" />

        <x-pdf.meta
            :items="[
                'Fecha' => optional($venta->fecha_emision)->format('d/m/Y'),
                'Vendedor' => $venta->vendedor?->name,
                'Almacén' => $venta->almacen?->nombre,
                'Pago' => ucfirst($venta->tipo_pago),
            ]"
            formato="ticket" />

        <x-pdf.items :filas="$filas" formato="ticket" />

        <x-pdf.totales
            :lineas="['Subtotal' => number_format((float) $venta->subtotal, 2)]"
            :total="number_format((float) $venta->total, 2)"
            :moneda="$moneda"
            :enLetras="$enLetras"
            formato="ticket" />

        @if (count($pagos))
            <table class="row">
                @foreach ($pagos as $p)
                    <tr><td class="muted">{{ $p['metodo'] }}</td><td class="right">{{ $moneda }} {{ $p['monto'] }}</td></tr>
                @endforeach
            </table>
            <div class="sep"></div>
        @endif

        @if ($venta->observaciones)<div class="muted">Obs.: {{ $venta->observaciones }}</div>@endif
    @else
        {{-- === A4 === --}}
        <x-pdf.encabezado
            :empresa="$empresa"
            titulo="NOTA DE VENTA"
            :numero="$documento"
            :estado="$anulada ? 'ANULADA' : null" />

        <x-pdf.meta
            :items="[
                'Cliente' => $clienteNombre,
                'RUC/DNI' => $venta->cliente?->numero_documento ?: '—',
                'Vendedor' => $venta->vendedor?->name ?: '—',
                'Forma pago' => ucfirst($venta->tipo_pago),
                'Moneda' => $monedaTxt,
                'F. emisión' => optional($venta->fecha_emision)->format('d/m/Y'),
                'Hora' => optional($venta->created_at)->format('H:i'),
                'Almacén' => $venta->almacen?->nombre ?: '—',
                'Estado' => $anulada ? 'ANULADA' : 'EMITIDA',
            ]" />

        <x-pdf.items
            :columnas="[
                ['label' => 'Ítem', 'key' => 'n', 'width' => '32px'],
                ['label' => 'Código', 'key' => 'codigo', 'width' => '72px'],
                ['label' => 'Cant.', 'key' => 'cantidad', 'align' => 'right', 'width' => '55px'],
                ['label' => 'Unidad', 'key' => 'unidad', 'width' => '90px'],
                ['label' => 'Descripción', 'key' => 'producto'],
                ['label' => 'P. Uni.', 'key' => 'precio', 'align' => 'right', 'width' => '72px'],
                ['label' => 'Importe', 'key' => 'subtotal', 'align' => 'right', 'width' => '80px'],
            ]"
            :filas="$filas"
            :minFilas="8" />

        <x-pdf.cierre
            :observaciones="$venta->observaciones"
            :lineas="[
                'Subtotal' => number_format((float) $venta->subtotal, 2),
                'Descuento' => (float) $venta->descuento_total > 0 ? '-' . number_format((float) $venta->descuento_total, 2) : null,
            ]"
            :total="number_format((float) $venta->total, 2)"
            :moneda="$moneda"
            :enLetras="$enLetras" />

        @if ($pagoTxt)
            <div class="muted" style="margin-top: 4px;">Pago: {{ $pagoTxt }}</div>
        @endif

        @if ($anulada && $venta->motivo_anulacion)
            <table class="marco" style="margin-top: 6px; border-color: {{ config('theme.danger') }};">
                <tr><td style="color: {{ config('theme.danger') }};"><span class="strong">ANULADA:</span> {{ $venta->motivo_anulacion }}</td></tr>
            </table>
        @endif
    @endif
@endsection
