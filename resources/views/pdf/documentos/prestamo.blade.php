@extends('pdf.layouts.' . $formato)

@section('titulo', 'Préstamo ' . $documento)

@section('contenido')
    @php
        $estadoLabel = ['prestado' => 'PRESTADO', 'parcial' => 'PARCIAL', 'devuelto' => 'DEVUELTO'];
        $estado = $estadoLabel[$prestamo->estado] ?? strtoupper((string) $prestamo->estado);
        $terceroLabel = $esPrestado ? 'Presté a' : 'Me prestó';
    @endphp

    @if ($formato === 'ticket')
        <x-pdf.titulo texto="PRÉSTAMO" :numero="$documento" formato="ticket" />
        <x-pdf.tercero :titulo="$terceroLabel" :nombre="$prestamo->tercero ?? '—'" :documento="$prestamo->tercero_documento" formato="ticket" />
        <x-pdf.meta
            :items="[
                'Almacén' => $prestamo->almacen?->nombre,
                'Fecha' => optional($prestamo->fecha_prestamo)->format('d/m/Y'),
                'Dev. esp.' => optional($prestamo->fecha_devolucion_esperada)->format('d/m/Y'),
                'Estado' => $estado,
            ]"
            formato="ticket" />
        <x-pdf.items :filas="$filas" formato="ticket" />
        @if ($prestamo->observaciones)<div class="muted">Obs.: {{ $prestamo->observaciones }}</div>@endif
    @else
        <x-pdf.encabezado :empresa="$empresa" titulo="PRÉSTAMO" :numero="$documento" />
        <x-pdf.meta
            :items="[
                $terceroLabel => $prestamo->tercero ?: '—',
                'DNI/RUC' => $prestamo->tercero_documento ?: '—',
                'Teléfono' => $prestamo->tercero_telefono ?: '—',
                'Almacén' => $prestamo->almacen?->nombre ?: '—',
                'F. préstamo' => optional($prestamo->fecha_prestamo)->format('d/m/Y'),
                'Dev. esperada' => optional($prestamo->fecha_devolucion_esperada)->format('d/m/Y') ?: '—',
                'Registró' => $prestamo->usuario?->name ?: '—',
                'Estado' => $estado,
            ]" />
        <x-pdf.items
            :columnas="[
                ['label' => 'Ítem', 'key' => 'n', 'width' => '32px'],
                ['label' => 'Código', 'key' => 'codigo', 'width' => '72px'],
                ['label' => 'Descripción', 'key' => 'producto'],
                ['label' => 'Unidad', 'key' => 'unidad', 'width' => '90px'],
                ['label' => 'Prestado', 'key' => 'prestado', 'align' => 'right', 'width' => '68px'],
                ['label' => 'Devuelto', 'key' => 'devuelto', 'align' => 'right', 'width' => '68px'],
                ['label' => 'Pendiente', 'key' => 'pendiente', 'align' => 'right', 'width' => '70px'],
            ]"
            :filas="$filas"
            :minFilas="8" />
        <table class="marco" style="margin-bottom: 20px;">
            <tr><td>
                <span class="strong upper" style="font-size: 8px;">Observaciones</span><br>
                {{ $prestamo->observaciones ?: '—' }}
            </td></tr>
        </table>
        <x-pdf.firmas :firmas="['Entregado por', 'Recibido por']" formato="a4" />
    @endif
@endsection
