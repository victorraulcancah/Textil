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
        <x-pdf.encabezado :empresa="$empresa" :titulo="$ingles ? 'PURCHASE ORDER' : 'ORDEN DE COMPRA'" :numero="$documento" :bajoLogo="$orden->codigo" />
        @if ($ingles)
            {{-- Purchase Order: la cabecera va en inglés (shipper, consignee, embarque y ficha de la tela). --}}
            @php
                $azul = config('theme.primary');
                $cab = "background: {$azul}; color: #fff; font-weight: bold; text-align: center; text-transform: uppercase; font-size: 8px; padding: 3px 4px; border: 2px solid #fff;";
                $val = 'text-align: center; font-size: 8.5px; padding: 3px 4px;';
                $g = $ingles;
                // Una tabla de etiqueta + dato: los datos arrancan todos en el mismo punto, sin línea visible.
                $celdaEtq = 'padding: 0 6px 0 0; vertical-align: top; white-space: nowrap; width: %dpx;';
                $celdaDato = 'padding: 0; vertical-align: top;';
            @endphp
            <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                <tr>
                    <td style="{{ $cab }}">Shipper / Seller</td>
                    <td style="{{ $cab }}">Consignee / Buyer</td>
                </tr>
                <tr>
                    <td style="vertical-align: top; padding: 4px 6px; font-size: 8.5px; line-height: 1.5;">
                        <strong>{{ $g['shipper']['name'] }}</strong>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="{{ sprintf($celdaEtq, 62) }}"><strong>ADDRESS:</strong></td><td style="{{ $celdaDato }}">{{ $g['shipper']['address'] }}</td></tr>
                            <tr><td style="{{ sprintf($celdaEtq, 62) }}"><strong>TAX ID:</strong></td><td style="{{ $celdaDato }}">{{ $g['shipper']['tax_id'] }}</td></tr>
                            <tr><td style="{{ sprintf($celdaEtq, 62) }}"><strong>TELEPHONE:</strong></td><td style="{{ $celdaDato }}">{{ $g['shipper']['telephone'] }}</td></tr>
                            @if ($g['shipper']['fax'])
                                <tr><td style="{{ sprintf($celdaEtq, 62) }}"><strong>FAX:</strong></td><td style="{{ $celdaDato }}">{{ $g['shipper']['fax'] }}</td></tr>
                            @endif
                        </table>
                    </td>
                    <td style="vertical-align: top; padding: 4px 6px; font-size: 8.5px; line-height: 1.5;">
                        <strong>{{ $g['consignee']['name'] }}</strong>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="{{ sprintf($celdaEtq, 62) }}"><strong>ADDRESS:</strong></td><td style="{{ $celdaDato }}">{{ $g['consignee']['address'] }}</td></tr>
                            <tr><td style="{{ sprintf($celdaEtq, 62) }}"><strong>RUC:</strong></td><td style="{{ $celdaDato }}">{{ $g['consignee']['ruc'] }}</td></tr>
                            <tr><td style="{{ sprintf($celdaEtq, 62) }}"><strong>TELEPHONE:</strong></td><td style="{{ $celdaDato }}">{{ $g['consignee']['telephone'] }}</td></tr>
                        </table>
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
                    <colgroup><col style="width: 58%"><col style="width: 20%"><col style="width: 22%"></colgroup>
                    <tr>
                        <td style="{{ $cab }} width: 52%;">Description of goods</td>
                        <td style="{{ $cab }} width: 26%;">Agreed price</td>
                        <td style="{{ $cab }} width: 22%;">Consider</td>
                    </tr>
                    <tr>
                        <td style="vertical-align: top; padding: 4px 6px; font-size: 8.5px; line-height: 1.6;">
                            {{-- Etiquetas en una columna y datos en otra: todos los datos arrancan en el mismo punto, sin línea visible. --}}
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr><td style="padding: 0; vertical-align: top; width: 72px;"><strong>Name:</strong></td><td style="padding: 0; vertical-align: top;"><strong>{{ $b['name'] }}</strong></td></tr>
                                <tr><td style="padding: 0; vertical-align: top; width: 72px;"><strong>Weight:</strong></td><td style="padding: 0; vertical-align: top;">{{ $b['weight'] }}</td></tr>
                                <tr><td style="padding: 0; vertical-align: top; width: 72px;"><strong>Width:</strong></td><td style="padding: 0; vertical-align: top;">{{ $b['width'] }}</td></tr>
                                <tr><td style="padding: 0; vertical-align: top; width: 72px;"><strong>Specification:</strong></td><td style="padding: 0; vertical-align: top;">{{ $b['specification'] }}</td></tr>
                            </table>
                        </td>
                        <td style="vertical-align: top; text-align: center; padding: 6px; font-size: 9px; border-left: 2px solid {{ $azul }}; border-right: 2px solid {{ $azul }};">
                            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 8.5px; line-height: 1.6;">
                                <tr><td style="{{ sprintf($celdaEtq, 104) }}"><strong>PRICE:</strong></td><td style="{{ $celdaDato }}"><strong>{{ $b['price'] }}</strong></td></tr>
                                <tr><td style="{{ sprintf($celdaEtq, 104) }}"><strong>DATE OF AGREEMENT:</strong></td><td style="{{ $celdaDato }}">{{ $g['date_of_agreement'] }}</td></tr>
                            </table>
                        </td>
                        <td style="vertical-align: top; padding: 4px 6px; font-size: 8.5px; line-height: 1.6;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr><td style="{{ sprintf($celdaEtq, 72) }}"><strong>HS CODE:</strong></td><td style="{{ $celdaDato }}">{{ $b['hs_code'] }}</td></tr>
                                <tr><td style="{{ sprintf($celdaEtq, 72) }}"><strong>1 ROLL(MTS):</strong></td><td style="{{ $celdaDato }}">{{ $b['roll'] }}</td></tr>
                            </table>
                        </td>
                    </tr>
                </table>

                {{-- Sus ítems, con el mismo formato de tabla del pedido; el TOTAL solo al final de todo. --}}
                <x-pdf.planilla
                    :grupos="[$planilla['grupos'][$loop->index]]"
                    :totales="$planilla['totales']"
                    :colorCode="true"
                    :conFactor="false"
                    :precios="false"
                    :conTotal="$loop->last" />
            @endforeach

            <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 8.5px;">
                <tr>
                    <td style="width: 34%;"><strong>ORDER DATE:</strong> {{ $g['date_of_agreement'] }}</td>
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
        <x-pdf.planilla :grupos="$planilla['grupos']" :totales="$planilla['totales']" :moneda="$moneda" :colorCode="true" :conFactor="false" />
        <x-pdf.cierre
            :observaciones="$orden->observaciones"
            :lineas="['Subtotal' => number_format($total, 2)]"
            :total="number_format($total, 2)"
            :moneda="$moneda"
            :enLetras="$enLetras" />
        @endunless
    @endif
@endsection
