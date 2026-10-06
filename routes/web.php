<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('app');
});

// Toda ruta es de la app de React, menos las de la API: una ruta de API que no existe (por ejemplo, con las rutas en
// caché de un despliegue a medias) debe dar un 404 y no la página de la app, que un Excel o un PDF descargarían como si
// fuera el archivo ("el formato no es válido" / visor en blanco).
Route::get('/{any}', function () {
    return view('app');
})->where('any', '^(?!api/).*');
