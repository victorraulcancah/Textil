<!DOCTYPE html>
<html lang="es">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        @php
            // Nombre e ícono de la pestaña: los de la empresa activa (igual que login y sidebar).
            $marca = \App\Models\Empresa::activa() ?? \App\Models\Empresa::first();
        @endphp
        <title>{{ $marca?->nombre_comercial ?: config('app.name', 'Textil') }}</title>
        <link rel="icon" href="{{ $marca?->favicon_url ?? asset('img/logo-telas-icon.svg') }}">
        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.jsx'])
    </head>
    <body class="antialiased">
        <div id="root"></div>
    </body>
</html>
