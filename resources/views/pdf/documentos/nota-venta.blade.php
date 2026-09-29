@extends('pdf.layouts.' . $formato)

@section('titulo', 'Proforma ' . $documento)

@section('contenido')
    @php
        $anulada = $venta->estado === 'anulada';
        $clienteNombre = $venta->cliente?->nombre ?? $venta->cliente?->razon_social ?? 'Clientes varios';
        $monedaTxt = $venta->moneda === 'USD' ? 'DÓLARES' : 'SOLES';
        $pagoTxt = collect($pagos)->map(fn ($p) => $p['metodo'] . ' ' . $moneda . ' ' . $p['monto'])->join(', ');
    @endphp

    @if ($formato === 'ticket')
        {{-- === TICKET (80mm) === --}}
        <x-pdf.titulo texto="PROFORMA" :numero="$documento" :estado="$anulada ? 'ANULADA' : null" formato="ticket" />

        <x-pdf.tercero titulo="Cliente" :nombre="$clienteNombre" :documento="$venta->cliente?->numero_documento" formato="ticket" />

        <x-pdf.meta
            :items="[
                'Fecha' => optional($venta->fecha_emision)->format('d/m/Y'),
                'Vendedor' => $venta->vendedor?->name,
                'Almacén' => $venta->almacen?->nombre,
                'Pago' => ucfirst($venta->tipo_pago),
            ]"
            formato="ticket" />

        <table>
            @foreach ($grupos as $g)
                <tr><td colspan="2" class="strong upper">{{ $g['producto'] }}</td></tr>
                @foreach ($g['filas'] as $f)
                    <tr>
                        <td class="muted">{{ $f['n'] }}. {{ $f['color'] !== '—' ? $f['color'].' · ' : '' }}{{ $f['cantidad'] }}{{ $f['u'] !== '' ? ' '.$f['u'] : '' }} x {{ $f['precio'] }}</td>
                        <td class="right">{{ $f['subtotal'] }}</td>
                    </tr>
                @endforeach
            @endforeach
        </table>
        <div class="sep"></div>

        <x-pdf.totales
            :lineas="['Subtotal' => number_format((float) $venta->subtotal, 2)]"
            :total="number_format((float) $venta->total, 2)"
            :moneda="$moneda"
            :enLetras="$enLetras"
            etiqueta="TOTAL A PAGAR"
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
            titulo="PROFORMA"
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

        {{-- Rollo por rollo, agrupado por producto. U.: R = rollo entero; vacía = metros. --}}
        <table class="items" style="margin-bottom: 6px;">
            <thead>
                <tr>
                    <th width="36px" style="text-align:center;">Ítem</th>
                    <th>Color</th>
                    <th width="86px" style="text-align:right;">Cantidad (m)</th>
                    <th width="34px" style="text-align:center;">U.</th>
                    <th width="72px" style="text-align:right;">Precio</th>
                    <th width="86px" style="text-align:right;">Subtotal</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($grupos as $g)
                    <tr>
                        <td colspan="6" class="strong upper" style="background: #dbe4f5;">Producto: {{ $g['producto'] }}</td>
                    </tr>
                    @foreach ($g['filas'] as $f)
                        <tr>
                            <td class="center">{{ $f['n'] }}</td>
                            <td>{{ $f['color'] }}</td>
                            <td class="right">{{ $f['cantidad'] }}</td>
                            <td class="center strong">{{ $f['u'] }}</td>
                            <td class="right">{{ $venta->moneda === 'USD' ? '$' : 'S/' }} {{ $f['precio'] }}</td>
                            <td class="right">{{ $venta->moneda === 'USD' ? '$' : 'S/' }} {{ $f['subtotal'] }}</td>
                        </tr>
                    @endforeach
                @endforeach
            </tbody>
        </table>

        <x-pdf.cierre
            :observaciones="$venta->observaciones"
            :lineas="[
                'Subtotal' => number_format((float) $venta->subtotal, 2),
                'Descuento' => (float) $venta->descuento_total > 0 ? '-' . number_format((float) $venta->descuento_total, 2) : null,
            ]"
            :total="number_format((float) $venta->total, 2)"
            :moneda="$moneda"
            :enLetras="$enLetras"
            etiqueta="TOTAL A PAGAR" />

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
