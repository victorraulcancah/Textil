@extends('pdf.layouts.' . $formato)

@section('titulo', 'Estado de cuenta ' . $cliente->nombre)

@section('contenido')
    <x-pdf.encabezado :empresa="$empresa" titulo="ESTADO DE CUENTA" :numero="$documento" />

    <x-pdf.tercero
        titulo="Cliente"
        :nombre="$cliente->nombre"
        :documento="trim(($cliente->tipo_documento ?? '') . ' ' . ($cliente->numero_documento ?? ''))"
        :direccion="$cliente->direccion"
        :telefono="$cliente->telefono" />

    <x-pdf.meta :items="array_merge(['Desde' => $desde, 'Hasta' => $hasta], $linea ?? [])" />

    @forelse ($monedas as $bloque)
        <div class="strong upper" style="font-size: 9px; margin: 12px 0 4px 0;">
            Movimientos en {{ $bloque['moneda'] === 'USD' ? 'dólares' : 'soles' }} ({{ $bloque['simbolo'] }})
        </div>
        <x-pdf.items
            :columnas="[
                ['label' => 'Fecha', 'key' => 'fecha', 'width' => '62px'],
                ['label' => 'Documento', 'key' => 'documento', 'width' => '80px'],
                ['label' => 'Detalle', 'key' => 'detalle'],
                ['label' => 'Cargo', 'key' => 'cargo', 'align' => 'right', 'width' => '75px'],
                ['label' => 'Abono', 'key' => 'abono', 'align' => 'right', 'width' => '75px'],
                ['label' => 'Saldo', 'key' => 'saldo', 'align' => 'right', 'width' => '80px'],
            ]"
            :filas="array_merge(
                [['fecha' => '', 'documento' => '', 'detalle' => 'Saldo anterior', 'cargo' => '', 'abono' => '', 'saldo' => $bloque['saldo_inicial']]],
                $bloque['filas'],
            )" />
        <x-pdf.totales
            :lineas="['Cargos' => $bloque['cargos'], 'Abonos' => $bloque['abonos']]"
            :total="$bloque['saldo_final']"
            etiqueta="SALDO"
            :moneda="$bloque['simbolo']" />
    @empty
        <table class="marco" style="margin-top: 12px;">
            <tr><td class="muted">El cliente no tiene ventas al crédito en este periodo.</td></tr>
        </table>
    @endforelse

    @if (count($cuotas))
        <div class="strong upper" style="font-size: 9px; margin: 14px 0 4px 0;">Cuotas pendientes</div>
        <x-pdf.items
            :columnas="[
                ['label' => 'Documento', 'key' => 'documento', 'width' => '90px'],
                ['label' => 'Cuota', 'key' => 'cuota', 'width' => '50px'],
                ['label' => 'Vence', 'key' => 'vence', 'width' => '70px'],
                ['label' => 'Situación', 'key' => 'situacion'],
                ['label' => 'Saldo', 'key' => 'saldo', 'align' => 'right', 'width' => '95px'],
            ]"
            :filas="$cuotas" />
    @endif

    <div class="muted" style="font-size: 8px; margin-top: 10px;">
        Resumen de las ventas al crédito y los pagos del cliente a la fecha de emisión.
        No es comprobante de pago.
    </div>
@endsection
