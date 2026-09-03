<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>@yield('titulo', 'Documento')</title>
    <style>
        /* Contenido casi a todo el ancho, como una factura/boleta impresa. */
        @page { margin: 22px 22px 40px 22px; }
        * { box-sizing: border-box; }
        body {
            font-family: 'DejaVu Sans', sans-serif;
            font-size: 10px;
            color: {{ config('theme.text') }};
            margin: 0;
        }
        footer { position: fixed; bottom: -26px; left: 0; right: 0; height: 26px; font-size: 8px; color: {{ config('theme.muted_light') }}; }
        .pagina:after { content: "Página " counter(page) " de " counter(pages); }

        h1, h2, h3, p { margin: 0; }
        .muted { color: {{ config('theme.muted') }}; }
        .strong { font-weight: bold; }
        .right { text-align: right; }
        .center { text-align: center; }
        .upper { text-transform: uppercase; }

        table { width: 100%; border-collapse: collapse; }

        /* Marco general de secciones (datos, son, observaciones) */
        .marco { border: 1px solid {{ config('theme.marco_border') }}; }
        .marco td { padding: 4px 8px; vertical-align: top; }

        /* Recuadro de la cabecera: RUC / tipo de documento / número */
        .docbox td { border: 1px solid {{ config('theme.primary_border') }}; padding: 5px 8px; text-align: center; }
        .docbox .hl { background: {{ config('theme.primary') }}; color: #fff; font-weight: bold; text-transform: uppercase; letter-spacing: .4px; }
        .docbox .num { font-weight: bold; font-size: 12px; }

        /* Tabla de ítems (encabezado de color, cuerpo con líneas suaves) */
        .items { border: 1px solid {{ config('theme.edge') }}; }
        .items th {
            background: {{ config('theme.primary') }}; color: #fff; font-size: 9px; text-transform: uppercase;
            letter-spacing: .3px; padding: 5px 6px; text-align: left;
        }
        .items td { padding: 4px 6px; border-bottom: 1px solid #eee; }
        .items .filler td { padding: 5px 6px; }

        /* Totales */
        .totales td { padding: 5px 10px; border: 1px solid {{ config('theme.edge') }}; }
        .totales .lbl { text-align: right; font-weight: bold; text-transform: uppercase; }
        .totales .tot { background: {{ config('theme.primary') }}; color: #fff; border-color: {{ config('theme.primary_border') }}; }
    </style>
</head>
<body>
    <footer>
        <table>
            <tr>
                <td class="muted">{{ $pieLegal ?? '' }}</td>
                <td class="right muted pagina" style="width: 140px;"></td>
            </tr>
        </table>
    </footer>

    <main>
        @yield('contenido')
    </main>
</body>
</html>
