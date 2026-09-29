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

        <x-pdf.items :filas="$filasTicket" formato="ticket" />

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

        {{-- La tela, por tela y rollo por rollo: cada rollo con su metraje real. --}}
        @if (count($telas))
            <table class="items" style="margin-bottom: 6px;">
                <thead>
                    <tr>
                        <th width="100px">Ítem</th>
                        <th>Color</th>
                        <th width="44px" style="text-align:right;">Rollo</th>
                        <th width="60px" style="text-align:right;">Factor</th>
                        <th width="66px" style="text-align:right;">Metros</th>
                        <th width="62px" style="text-align:right;">P. Unit.</th>
                        <th width="80px" style="text-align:right;">P. Total</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach ($telas as $tela)
                        <tr>
                            <td colspan="7" class="strong upper" style="background: #f5f5f4;">{{ $tela['producto'] }}</td>
                        </tr>
                        @foreach ($tela['filas'] as $f)
                            <tr>
                                <td>{{ $f['item'] }}</td>
                                <td>{{ $f['color'] }}</td>
                                <td class="right">{{ $f['rollo'] }}</td>
                                <td class="right">{{ $f['factor'] }}</td>
                                <td class="right">{{ $f['metros'] }}</td>
                                <td class="right">{{ $f['precio'] }}</td>
                                <td class="right">{{ $f['total'] }}</td>
                            </tr>
                        @endforeach
                        <tr>
                            <td colspan="2" class="strong" style="border-top: 1px solid {{ config('theme.edge') }};">Subtotal {{ $tela['producto'] }}</td>
                            <td class="right strong" style="border-top: 1px solid {{ config('theme.edge') }};">{{ $tela['rollos'] }}</td>
                            <td class="right muted" style="border-top: 1px solid {{ config('theme.edge') }};">{{ $tela['cortes'] }}</td>
                            <td class="right strong" style="border-top: 1px solid {{ config('theme.edge') }};">{{ $tela['metros'] }}</td>
                            <td style="border-top: 1px solid {{ config('theme.edge') }};"></td>
                            <td class="right strong" style="border-top: 1px solid {{ config('theme.edge') }};">{{ $tela['total'] }}</td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        @endif

        @if (count($filas) || ! count($telas))
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
            :minFilas="count($telas) ? 0 : 8" />
        @endif

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
