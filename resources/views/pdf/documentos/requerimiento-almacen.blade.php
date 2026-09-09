@extends('pdf.layouts.' . $formato)

@section('titulo', 'Requerimiento de almacén ' . $documento)

@section('contenido')
    <x-pdf.encabezado :empresa="$empresa" titulo="REQUERIMIENTO DE ALMACÉN" :numero="$documento" />

    <x-pdf.meta
        :items="[
            'Pedido' => $orden->documento,
            'Cliente' => $orden->cliente?->nombre ?: 'Cliente varios',
            'Fecha' => optional($orden->fecha_preparacion ?? $orden->fecha_emision)->format('d/m/Y H:i'),
            'Entrega' => optional($orden->fecha_entrega)->format('d/m/Y') ?: '—',
            'Solicita' => $orden->vendedor?->name ?: '—',
            'Prepara' => $orden->usuarioPrepara?->name ?: '—',
        ]" />

    {{-- Sin precios: al almacenero no le sirven y no tiene por qué verlos.
         Tampoco lleva rollos impresos, porque los elige él al preparar. --}}
    <x-pdf.items
        :columnas="[
            ['label' => '#', 'key' => 'n', 'width' => '28px'],
            ['label' => 'Código', 'key' => 'codigo', 'width' => '70px'],
            ['label' => 'Producto', 'key' => 'producto'],
            ['label' => 'Presentación', 'key' => 'presentacion', 'width' => '105px'],
            ['label' => 'Pedido', 'key' => 'metros', 'align' => 'right', 'width' => '65px'],
            ['label' => 'Cubierto', 'key' => 'asignado', 'align' => 'right', 'width' => '65px'],
            ['label' => 'Falta', 'key' => 'pendiente', 'align' => 'right', 'width' => '60px'],
        ]"
        :filas="$filas"
        :minFilas="8" />

    <table class="marco" style="margin: 6px 0 16px 0;">
        <tr>
            <td class="strong upper" style="font-size: 10px;">{{ $total_lineas }} producto(s)</td>
            <td class="strong upper right" style="font-size: 10px;">{{ $total_metros }} metros</td>
        </tr>
    </table>

    {{-- Lo que ya se juntó. Sirve como constancia de qué salió del almacén. --}}
    @php $conRollos = collect($filas)->filter(fn ($f) => $f['rollos'] !== ''); @endphp
    @if ($conRollos->isNotEmpty())
        <div class="strong upper" style="font-size: 8px; margin-bottom: 4px;">Rollos ya asignados</div>
        <table class="marco" style="margin-bottom: 14px;">
            @foreach ($conRollos as $f)
                <tr><td>
                    <span class="strong">{{ $f['producto'] }}</span> · {{ $f['rollos'] }}
                </td></tr>
            @endforeach
        </table>
    @endif

    <div class="muted" style="font-size: 8px;">
        Baja del rack los metros que pide cada línea y escanea cada rollo: el sistema
        los va sumando y avisa cuando la línea queda cubierta. Los rollos no vienen
        impresos porque los eliges tú según lo que haya en el almacén.
    </div>

    <x-pdf.firmas :firmas="['Prepara', 'Verifica', 'Recibe']" />
@endsection
