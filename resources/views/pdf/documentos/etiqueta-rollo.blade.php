{{--
    Etiqueta adhesiva del rollo.

    No extiende el layout A4 porque el papel es otro: un rollo de etiquetas de
    80x50 mm (el tamaño sale de config/rollos.php). Una etiqueta por página, para que la impresora corte donde debe.

    Se imprime una o muchas: el mismo blade sirve para la etiqueta suelta y
    para el lote de un color entero.
--}}
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Etiquetas de rollo</title>
    @php
        // Vertical (50 x 80): el QR va debajo del texto y centrado. Horizontal (80 x 50): a la derecha del texto.
        $vertical = (float) config('rollos.etiqueta.alto_mm') > (float) config('rollos.etiqueta.ancho_mm');
        $altoPx = (int) round(config('rollos.etiqueta.alto_mm') * 96 / 25.4) - ($vertical ? 14 : 13);
        // Girada: la hoja es de lado (alto x ancho) y el diseño se gira 90° a la izquierda dentro de ella.
        $girar = (bool) config('rollos.etiqueta.girar');
        $diseñoAncho = (int) round(config('rollos.etiqueta.ancho_mm') * 96 / 25.4);
        $diseñoAlto = (int) round(config('rollos.etiqueta.alto_mm') * 96 / 25.4);
        // La etiqueta de 100 x 60 tiene más lugar que la de 80 x 50: letras y códigos van un poco más grandes.
        $grande = ! $vertical && (float) config('rollos.etiqueta.ancho_mm') >= 95;
    @endphp
    <style>
        @page { margin: 0; }
        * { box-sizing: border-box; }
        body {
            font-family: 'DejaVu Sans', sans-serif;
            color: {{ config('theme.text') }};
            margin: 0;
        }

        /* El alto sale del papel (a 96 dpi); dompdf suma el padding al alto, por eso se deja margen. */
        .etiqueta {
            height: {{ $altoPx - ($grande ? 8 : 0) }}px;
            padding: {{ $grande ? 9 : 5 }}px {{ $vertical ? 7 : ($grande ? 12 : 8) }}px;
            overflow: hidden;
            page-break-after: always;
        }
        .etiqueta:last-child { page-break-after: auto; }

        .producto {
            font-size: {{ $vertical ? 10.5 : ($grande ? 12 : 11) }}px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: .3px;
            line-height: 1.1;
        }
        .linea { font-size: {{ $grande ? 9 : 7.5 }}px; margin-top: {{ $grande ? 2 : 1 }}px; }
        .linea .et { color: {{ config('theme.muted') }}; }

        /* El código y el metraje son lo que se lee de lejos, en el rack. */
        .codigo {
            font-size: {{ $vertical ? 12 : ($grande ? 16 : 13) }}px;
            font-weight: bold;
            letter-spacing: .2px;
            margin-top: {{ $grande ? 5 : 2 }}px;
        }
        .metraje {
            font-size: {{ $grande ? 20 : 17 }}px;
            font-weight: bold;
            color: {{ config('theme.primary') }};
            line-height: 1;
        }
        .metraje .peso {
            font-size: 9px;
            font-weight: normal;
            color: {{ config('theme.muted') }};
            display: block;
            margin-top: 1px;
        }

        .codigos { margin-top: {{ $grande ? 6 : 2 }}px; }
        .codigos td { vertical-align: middle; text-align: center; padding: 0 4px; }
        .qr { height: {{ $vertical ? 72 : ($grande ? 78 : 60) }}px; width: {{ $vertical ? 72 : ($grande ? 78 : 60) }}px; }
        .barras { height: {{ $vertical ? 32 : ($grande ? 44 : 30) }}px; width: 100%; }
        .pie { font-size: {{ $grande ? 8 : 6.5 }}px; color: {{ config('theme.muted_light') }}; margin-top: {{ $grande ? 5 : 2 }}px; }
    </style>
</head>
<body>
@foreach ($etiquetas as $e)
    @if ($girar)
        <div style="position: relative; width: {{ $diseñoAlto }}px; height: {{ $diseñoAncho - 2 }}px; overflow: hidden; page-break-after: {{ $loop->last ? 'auto' : 'always' }};">
        <div style="position: absolute; left: 0; top: 0; width: {{ $diseñoAncho }}px; height: {{ $diseñoAlto }}px; transform-origin: 0 0; transform: translateY({{ $diseñoAncho }}px) rotate(-90deg);">
    @endif
    <div class="etiqueta">
        <table style="width: 100%;">
            <tr>
                <td style="vertical-align: top;">
                    <div class="producto">{{ $e['producto'] }} · {{ $e['color'] }}</div>
                    <div class="linea">
                        {{-- El producto es la tela más su color: 01-01-030-0074. --}}
                        <span class="et">Producto:</span>
                        <strong>{{ $e['codigo_producto'] }}@if ($e['codigo_color'])-{{ $e['codigo_color'] }}@endif</strong>
                    </div>
                    <div class="codigo">{{ $e['codigo'] }}</div>
                    <div class="metraje">
                        {{ $e['metros_fabrica'] }} m
                        @if ($e['peso_kg'])
                            <span class="peso">peso neto {{ $e['peso_kg'] }} kg</span>
                        @endif
                    </div>
                    <div class="linea">
                        <span class="et">Metraje de fábrica</span>
                        @if ($e['metros'] !== $e['metros_fabrica'])
                            &nbsp;·&nbsp;<span class="et">Saldo actual:</span> <strong>{{ $e['metros'] }} m</strong>
                        @endif
                    </div>
                    <div class="linea">
                        {{-- El último número del código es el del rollo: se dice aparte. --}}
                        <span class="et">Rollo Nº</span> <strong>{{ $e['numero'] }}</strong>
                        @if ($e['posicion'])
                            &nbsp;·&nbsp;<span class="et">{{ $e['posicion'] }} de esta tela y color</span>
                        @endif
                        @if ($e['orden'])
                            &nbsp;·&nbsp;<span class="et">Orden:</span> {{ $e['orden'] }}
                        @endif
                    </div>
                </td>
                @if ($e['qr'] && ! $vertical)
                    {{-- Sin código de barras sobra espacio: el QR se imprime más grande, que se lee mejor. --}}
                    <td style="width: {{ $e['barras'] ? ($grande ? 90 : 66) : 100 }}px; text-align: right; vertical-align: top;">
                        <img class="qr" @unless ($e['barras']) style="height: 92px; width: 92px;" @endunless src="{{ $e['qr'] }}" alt="{{ $e['codigo'] }}">
                    </td>
                @endif
            </tr>
        </table>

        {{-- En vertical el QR va centrado debajo del texto. --}}
        @if ($e['qr'] && $vertical)
            <div style="text-align: center; margin-top: 4px;">
                <img class="qr" @unless ($e['barras']) style="height: 104px; width: 104px;" @endunless src="{{ $e['qr'] }}" alt="{{ $e['codigo'] }}">
            </div>
        @endif

        @if ($e['barras'])
            <table class="codigos" style="width: 100%;">
                <tr>
                    <td><img class="barras" src="{{ $e['barras'] }}" alt="{{ $e['codigo'] }}"></td>
                </tr>
            </table>
        @endif

        <div class="pie">{{ $empresa?->nombre_comercial ?? $empresa?->razon_social }} · {{ $e['ubicacion'] }}</div>
    </div>
    @if ($girar)
        </div>
        </div>
    @endif
@endforeach
</body>
</html>
