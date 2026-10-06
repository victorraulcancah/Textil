{{--
    Etiqueta adhesiva del rollo.

    No extiende el layout A4 porque el papel es otro: un rollo de etiquetas de
    100x60 mm. Una etiqueta por página, para que la impresora corte donde debe.

    Se imprime una o muchas: el mismo blade sirve para la etiqueta suelta y
    para el lote de un color entero.
--}}
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Etiquetas de rollo</title>
    <style>
        @page { margin: 0; }
        * { box-sizing: border-box; }
        body {
            font-family: 'DejaVu Sans', sans-serif;
            color: {{ config('theme.text') }};
            margin: 0;
        }

        /* Papel de 80x50 mm (~302x189 px a 96 dpi). dompdf suma el padding al alto: se deja margen. */
        .etiqueta {
            height: 176px;
            padding: 5px 8px;
            overflow: hidden;
            page-break-after: always;
        }
        .etiqueta:last-child { page-break-after: auto; }

        .producto {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: .3px;
            line-height: 1.1;
        }
        .linea { font-size: 7.5px; margin-top: 1px; }
        .linea .et { color: {{ config('theme.muted') }}; }

        /* El código y el metraje son lo que se lee de lejos, en el rack. */
        .codigo {
            font-size: 13px;
            font-weight: bold;
            letter-spacing: .3px;
            margin-top: 2px;
        }
        .metraje {
            font-size: 17px;
            font-weight: bold;
            color: {{ config('theme.primary') }};
            line-height: 1;
        }
        .metraje .peso {
            font-size: 9px;
            font-weight: normal;
            color: {{ config('theme.muted') }};
        }

        .codigos { margin-top: 2px; }
        .codigos td { vertical-align: middle; text-align: center; padding: 0 4px; }
        .qr { height: 60px; width: 60px; }
        .barras { height: 30px; width: 100%; }
        .pie { font-size: 6.5px; color: {{ config('theme.muted_light') }}; margin-top: 2px; }
    </style>
</head>
<body>
@foreach ($etiquetas as $e)
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
                            <span class="peso">· peso neto {{ $e['peso_kg'] }} kg</span>
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
                @if ($e['qr'])
                    <td style="width: 66px; text-align: right; vertical-align: top;">
                        <img class="qr" src="{{ $e['qr'] }}" alt="{{ $e['codigo'] }}">
                    </td>
                @endif
            </tr>
        </table>

        @if ($e['barras'])
            <table class="codigos" style="width: 100%;">
                <tr>
                    <td><img class="barras" src="{{ $e['barras'] }}" alt="{{ $e['codigo'] }}"></td>
                </tr>
            </table>
        @endif

        <div class="pie">{{ $empresa?->nombre_comercial ?? $empresa?->razon_social }} · {{ $e['ubicacion'] }}</div>
    </div>
@endforeach
</body>
</html>
