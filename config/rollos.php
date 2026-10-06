<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Simbología de la etiqueta
    |--------------------------------------------------------------------------
    | Qué se imprime en la etiqueta que se pega al rollo:
    |
    |   'qr'     → solo código QR. Necesita un lector 2D (de imagen).
    |   'barras' → solo código de barras Code 128. Lo lee cualquier pistola
    |              láser, incluidas las más baratas.
    |   'ambos'  → los dos. Es lo que viene por defecto porque funciona con
    |              cualquier lector: si la tienda cambia de pistola, la
    |              etiqueta ya impresa sigue sirviendo.
    |
    | Ambos códigos llevan lo mismo dentro: el código del rollo (A103-01-0001).
    | Al escanearlo el sistema consulta la base y muestra los datos al día, así
    | que no hace falta meter más información en el código.
    */
    'etiqueta' => [
        // Por ahora solo QR: la etiqueta ya no lleva código de barras (se vuelve a activar con ROLLOS_SIMBOLOGIA=ambos).
        'simbologia' => env('ROLLOS_SIMBOLOGIA', 'qr'),

        // Tamaño del papel de la etiqueta, en milímetros: ANCHO x ALTO. La etiqueta adhesiva es de 80 x 50 mm (horizontal).
        // Con el alto mayor que el ancho el diseño se arma en vertical; al revés, en horizontal.
        'ancho_mm' => (float) env('ROLLOS_ETIQUETA_ANCHO_MM', 80),
        'alto_mm' => (float) env('ROLLOS_ETIQUETA_ALTO_MM', 50),

        // Alto del código de barras en píxeles del PNG que se incrusta.
        'barras_alto' => 60,
        'barras_ancho_barra' => 2,

        // Lado del QR en píxeles.
        'qr_lado' => 220,
    ],

];
