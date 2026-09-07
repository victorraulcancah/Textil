@extends('pdf.layouts.' . $formato)

@section('titulo', 'Requerimiento de almacén ' . $documento)

@section('contenido')
    <x-pdf.encabezado :empresa="$empresa" titulo="REQUERIMIENTO DE ALMACÉN" :numero="$documento" />

    <x-pdf.meta
        :items="[
            'Pedido' => $orden->documento,
            'Cliente' => $orden->cliente?->nombre ?: 'Cliente varios',
            'Almacén' => $orden->almacen?->nombre ?: '—',
            'Fecha' => optional($orden->fecha_preparacion ?? $orden->fecha_emision)->format('d/m/Y H:i'),
            'Solicita' => $orden->vendedor?->name ?: '—',
            'Prepara' => $orden->usuarioPrepara?->name ?: '—',
        ]" />

    {{-- Sin precios: al almacenero no le sirven y no tiene por qué verlos.
         Ordenado por ubicación para recorrer el rack una sola vez. --}}
    <x-pdf.items
        :columnas="[
            ['label' => '#', 'key' => 'n', 'width' => '28px'],
            ['label' => 'Rollo', 'key' => 'codigo', 'width' => '115px'],
            ['label' => 'Tela', 'key' => 'producto'],
            ['label' => 'Color', 'key' => 'color', 'width' => '95px'],
            ['label' => 'Ubicación', 'key' => 'ubicacion', 'width' => '150px'],
            ['label' => 'Metros', 'key' => 'metros', 'align' => 'right', 'width' => '65px'],
            ['label' => 'OK', 'key' => 'marca', 'align' => 'center', 'width' => '32px'],
        ]"
        :filas="collect($filas)->map(fn ($f) => $f + ['marca' => $f['escaneado'] ? 'X' : ''])->all()"
        :minFilas="10" />

    <table class="marco" style="margin: 6px 0 16px 0;">
        <tr>
            <td class="strong upper" style="font-size: 10px;">Total: {{ $total_rollos }} rollos</td>
            <td class="strong upper right" style="font-size: 10px;">{{ $total_metros }} metros</td>
        </tr>
    </table>

    @php $parciales = collect($filas)->where('parcial', true); @endphp
    @if ($parciales->isNotEmpty())
        <table class="marco" style="margin-bottom: 14px;">
            <tr><td>
                <span class="strong upper" style="font-size: 8px;">Atención · rollos que se cortan</span><br>
                @foreach ($parciales as $p)
                    {{ $p['codigo'] }}: sacar <strong>{{ $p['metros'] }} m</strong>, el resto vuelve al rack.<br>
                @endforeach
            </td></tr>
        </table>
    @endif

    <div class="muted" style="font-size: 8px;">
        Escanea cada rollo antes de despachar: el sistema avisa si alguno no
        corresponde a este requerimiento. La casilla OK es solo respaldo si la
        pistola falla.
    </div>

    <x-pdf.firmas :firmas="['Prepara', 'Verifica', 'Recibe']" />
@endsection
