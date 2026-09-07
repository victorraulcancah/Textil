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

        .etiqueta {
            width: 100%;
            padding: 10px 12px;
            page-break-after: always;
        }
        .etiqueta:last-child { page-break-after: auto; }

        .producto {
            font-size: 13px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: .3px;
            line-height: 1.1;
        }
        .linea { font-size: 9px; margin-top: 2px; }
        .linea .et { color: {{ config('theme.muted') }}; }

        /* El código y el metraje son lo que se lee de lejos, en el rack. */
        .codigo {
            font-size: 15px;
            font-weight: bold;
            letter-spacing: .5px;
            margin-top: 4px;
        }
        .metraje {
            font-size: 20px;
            font-weight: bold;
            color: {{ config('theme.primary') }};
            line-height: 1;
        }

        .codigos { margin-top: 6px; }
        .codigos td { vertical-align: middle; text-align: center; padding: 0 4px; }
        .qr { height: 78px; }
        .barras { height: 46px; width: 100%; }
        .pie { font-size: 7px; color: {{ config('theme.muted_light') }}; margin-top: 3px; }
    </style>
</head>
<body>
@foreach ($etiquetas as $e)
    <div class="etiqueta">
        <table>
            <tr>
                <td style="vertical-align: top;">
                    <div class="producto">{{ $e['producto'] }}</div>
                    <div class="linea">
                        <span class="et">Tela:</span> <strong>{{ $e['codigo_producto'] }}</strong>
                        &nbsp;·&nbsp;
                        <span class="et">Color:</span>
                        <strong>{{ $e['color'] }}</strong>@if ($e['codigo_color']) ({{ $e['codigo_color'] }})@endif
                    </div>
                    <div class="codigo">{{ $e['codigo'] }}</div>
                    <div class="metraje">{{ $e['metros'] }} m</div>
                </td>
                @if ($e['qr'])
                    <td style="width: 88px; text-align: right;">
                        <img class="qr" src="{{ $e['qr'] }}" alt="{{ $e['codigo'] }}">
                    </td>
                @endif
            </tr>
        </table>

        @if ($e['barras'])
            <table class="codigos">
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
