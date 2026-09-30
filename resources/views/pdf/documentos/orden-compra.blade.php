@extends('pdf.layouts.' . $formato)

@section('titulo', 'Orden de compra ' . $documento)

@section('contenido')
    @php
        $estadoLabel = [
            'pendiente' => 'PENDIENTE', 'aprobada' => 'APROBADA', 'enviada' => 'ENVIADA',
            'parcial' => 'PARCIAL', 'completada' => 'COMPLETADA', 'anulada' => 'ANULADA',
        ];
        $estado = $estadoLabel[$orden->estado] ?? strtoupper((string) $orden->estado);
    @endphp

    @if ($formato === 'ticket')
        <x-pdf.titulo texto="ORDEN DE COMPRA" :numero="$documento" formato="ticket" />
        <x-pdf.tercero titulo="Proveedor" :nombre="$orden->proveedor?->nombre ?? '—'" :documento="$orden->proveedor?->ruc" formato="ticket" />
        <x-pdf.meta
            :items="[
                'Emisión' => optional($orden->fecha_emision)->format('d/m/Y'),
                'Entrega' => optional($orden->fecha_entrega_estimada)->format('d/m/Y'),
                'Solicita' => $orden->usuarioCrea?->name,
                'Estado' => $estado,
            ]"
            formato="ticket" />
        <x-pdf.items :filas="$filas" formato="ticket" />
        <x-pdf.totales
            :lineas="['Subtotal' => number_format($total, 2)]"
            :total="number_format($total, 2)"
            :moneda="$moneda"
            :enLetras="$enLetras"
            formato="ticket" />
        @if ($orden->observaciones)<div class="muted">Obs.: {{ $orden->observaciones }}</div>@endif
    @else
        <x-pdf.encabezado :empresa="$empresa" :titulo="$ingles ? 'PURCHASE ORDER' : 'ORDEN DE COMPRA'" :numero="$documento" />
        @if ($ingles)
            {{-- Purchase Order: la cabecera va en inglés (shipper, consignee, embarque y ficha de la tela). --}}
            @php
                $azul = config('theme.primary');
                $cab = "background: {$azul}; color: #fff; font-weight: bold; text-align: center; text-transform: uppercase; font-size: 8px; padding: 3px 4px; border: 2px solid #fff;";
                $val = 'text-align: center; font-size: 8.5px; padding: 3px 4px;';
                $g = $ingles;
            @endphp
            <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                <tr>
                    <td style="{{ $cab }}">Shipper / Seller</td>
                    <td style="{{ $cab }}">Consignee / Buyer</td>
                </tr>
                <tr>
                    <td style="vertical-align: top; padding: 4px 6px; font-size: 8.5px; line-height: 1.5;">
                        <strong>{{ $g['shipper']['name'] }}</strong><br>
                        <strong>ADDRESS:</strong> {{ $g['shipper']['address'] }}<br>
                        <strong>TAX ID:</strong> {{ $g['shipper']['tax_id'] }}<br>
                        <strong>TELEPHONE:</strong> {{ $g['shipper']['telephone'] }}
                        @if ($g['shipper']['fax'])&nbsp;&nbsp;&nbsp;<strong>FAX:</strong> {{ $g['shipper']['fax'] }}@endif
                    </td>
                    <td style="vertical-align: top; padding: 4px 6px; font-size: 8.5px; line-height: 1.5;">
                        <strong>{{ $g['consignee']['name'] }}</strong><br>
                        <strong>ADDRESS:</strong> {{ $g['consignee']['address'] }}<br>
                        <strong>RUC:</strong> {{ $g['consignee']['ruc'] }}<br>
                        <strong>TELEPHONE:</strong> {{ $g['consignee']['telephone'] }}
                    </td>
                </tr>
            </table>

            <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                <tr>
                    <td style="{{ $cab }}">Cargo type</td>
                    <td style="{{ $cab }}">Container no.</td>
                    <td style="{{ $cab }}">Shipment</td>
                    <td style="{{ $cab }}">Country of origin</td>
                    <td style="{{ $cab }}">Final destination</td>
                    <td style="{{ $cab }}">Incoterms</td>
                </tr>
                <tr>
                    <td style="{{ $val }}">{{ $g['cargo_type'] }}</td>
                    <td style="{{ $val }}">{{ $g['container'] }}</td>
                    <td style="{{ $val }}">{{ $g['shipment'] }}</td>
                    <td style="{{ $val }}">{{ $g['origin'] }}</td>
                    <td style="{{ $val }}">{{ $g['destination'] }}</td>
                    <td style="{{ $val }}">{{ $g['incoterms'] }}</td>
                </tr>
            </table>

            <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                <tr>
                    <td style="{{ $cab }}">Port of departure</td>
                    <td style="{{ $cab }}">Port of arrival</td>
                </tr>
                <tr>
                    <td style="{{ $val }}">{{ $g['port_departure'] }}</td>
                    <td style="{{ $val }}">{{ $g['port_arrival'] }}</td>
                </tr>
            </table>

            {{-- La mercadería, intercalada: la ficha de una tela y enseguida sus ítems; luego la siguiente. --}}
            @foreach ($g['bienes'] as $b)
                <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 14px;">
                    <colgroup><col style="width: 50%"><col style="width: 25%"><col style="width: 25%"></colgroup>
                    <tr>
                        <td style="{{ $cab }}">Description of goods</td>
                        <td style="{{ $cab }}">Agreed price</td>
                        <td style="{{ $cab }}">Consider</td>
                    </tr>
                    <tr>
                        <td style="vertical-align: top; padding: 4px 6px; font-size: 8.5px; line-height: 1.6;">
                            <strong>Name:</strong> <strong>{{ $b['name'] }}</strong><br>
                            <strong>Weight:</strong> {{ $b['weight'] }}<br>
                            <strong>Width:</strong> {{ $b['width'] }}<br>
                            <strong>Specification:</strong> {{ $b['specification'] }}
                        </td>
                        <td style="vertical-align: top; text-align: center; padding: 6px; font-size: 9px; border-left: 2px solid {{ $azul }}; border-right: 2px solid {{ $azul }};">
                            <div style="margin-bottom: 10px;">{{ $b['price'] }}</div>
                            <div style="font-size: 8px; text-align: left;">DATE OF AGREEMENT:</div>
                            <div style="text-align: right;">{{ $g['date_of_agreement'] }}</div>
                        </td>
                        <td style="vertical-align: top; padding: 4px 6px; font-size: 8.5px; line-height: 1.6;">
                            HS CODE : <span style="float: right;">{{ $b['hs_code'] }}</span><br>
                            1 ROLL(MTS): <span style="float: right;">{{ $b['roll'] }}</span>
                        </td>
                    </tr>
                </table>

                {{-- Sus ítems, con el mismo formato de tabla del pedido; el TOTAL solo al final de todo. --}}
                <x-pdf.planilla
                    :grupos="[$planilla['grupos'][$loop->index]]"
                    :totales="$planilla['totales']"
                    :colorCode="true"
                    :precios="false"
                    :conTotal="$loop->last" />
            @endforeach

            <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 8.5px;">
                <tr>
                    <td style="width: 34%;"><strong>SHIPPING DATE:</strong> {{ $g['shipping_date'] }}</td>
                    <td style="width: 33%;"><strong>PREPARED BY:</strong> {{ $g['prepared_by'] }}</td>
                    <td style="width: 33%;"><strong>APPROVED BY:</strong> {{ $g['approved_by'] }}</td>
                </tr>
            </table>
            <div style="margin-top: 8px; font-size: 8.5px;"><strong>NOTE:</strong> {{ $g['note'] }}</div>
        @else
            <x-pdf.meta
                :items="[
                    'Proveedor' => $orden->proveedor?->nombre ?: '—',
                    'RUC' => $orden->proveedor?->ruc ?: '—',
                    'Dirección' => $orden->proveedor?->direccion ?: '—',
                    'Cond. pago' => $orden->condicion_pago ?: '—',
                    'F. emisión' => optional($orden->fecha_emision)->format('d/m/Y'),
                    'Entrega est.' => optional($orden->fecha_entrega_estimada)->format('d/m/Y') ?: '—',
                    'Solicita' => $orden->usuarioCrea?->name ?: '—',
                    'Estado' => $estado,
                ]" />
            @if ($datosExterior)
                <div class="strong upper" style="margin: 8px 0 2px;">Datos de embarque</div>
                <x-pdf.meta :items="$datosExterior" />
            @endif
        @endif
        @unless ($ingles)
        {{-- La planilla: una tabla por tela, con el color code que se escribió en la orden. --}}
        <x-pdf.planilla :grupos="$planilla['grupos']" :totales="$planilla['totales']" :moneda="$moneda" :colorCode="true" />
        <x-pdf.cierre
            :observaciones="$orden->observaciones"
            :lineas="['Subtotal' => number_format($total, 2)]"
            :total="number_format($total, 2)"
            :moneda="$moneda"
            :enLetras="$enLetras" />
        @endunless
    @endif
@endsection
