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
            @php($g = $ingles)
            @include('pdf.documentos._purchase', ['g' => $ingles, 'planilla' => $planilla, 'planillaFactor' => ! ($impresion ?? false), 'planillaColorCode' => ! ($impresion ?? false)])
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
        <x-pdf.planilla :grupos="$planilla['grupos']" :totales="$planilla['totales']" :moneda="$moneda" :colorCode="! ($impresion ?? false)" :conFactor="! ($impresion ?? false)" />
        <x-pdf.cierre
            :observaciones="$orden->observaciones"
            :lineas="['Subtotal' => number_format($total, 2)]"
            :total="number_format($total, 2)"
            :moneda="$moneda"
            :enLetras="$enLetras" />
        @endunless
    @endif
@endsection
