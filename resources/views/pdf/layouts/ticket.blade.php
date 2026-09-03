<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>@yield('titulo', 'Documento')</title>
    <style>
        @php $m = config('pdf.ticket.margen_mm', 4); @endphp
        @page { margin: {{ $m }}mm; }
        * { box-sizing: border-box; }
        body {
            font-family: 'DejaVu Sans Mono', 'DejaVu Sans', monospace;
            font-size: 9px;
            color: #000;
            margin: 0;
            line-height: 1.35;
        }
        h1, h2, h3, p { margin: 0; }
        .center { text-align: center; }
        .right { text-align: right; }
        .strong { font-weight: bold; }
        .muted { color: #444; }
        .sep { border-top: 1px dashed #000; margin: 5px 0; }
        .row { width: 100%; }
        .row td { padding: 1px 0; vertical-align: top; }
        table { width: 100%; border-collapse: collapse; }
    </style>
</head>
<body>
    <x-pdf.empresa :empresa="$empresa" formato="ticket" />
    @yield('contenido')
    <x-pdf.pie :pieLegal="$pieLegal ?? null" :generadoEn="$generadoEn ?? null" formato="ticket" />
</body>
</html>
