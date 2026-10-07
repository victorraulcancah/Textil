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
        // QR y código de barras, como antes: cualquier lector sirve (la pistola láser lee las barras, la cámara el QR).
        // Con ROLLOS_SIMBOLOGIA=qr la etiqueta lleva solo el QR.
        'simbologia' => env('ROLLOS_SIMBOLOGIA', 'ambos'),

        // Tamaño del papel de la etiqueta, en milímetros: ANCHO x ALTO. La etiqueta es de 100 x 60 mm (horizontal): el PDF
        // sale de ese tamaño (99.8 x 60.0 en el visor) y la impresora lo ajusta a su papel.
        // Con el alto mayor que el ancho el diseño se arma en vertical; al revés, en horizontal.
        'ancho_mm' => (float) env('ROLLOS_ETIQUETA_ANCHO_MM', 100),
        'alto_mm' => (float) env('ROLLOS_ETIQUETA_ALTO_MM', 60),

        // Girada: el papel sale de 50 x 80 con el diseño de 80 x 50 girado 90° a la izquierda. Por defecto NO: la hoja
        // sale de 80 x 50 (horizontal) y el texto se lee derecho, que es el papel que la etiquetadora tiene configurado.
        // Con ROLLOS_ETIQUETA_GIRAR=true vuelve a salir de 50 x 80 con el texto de lado.
        'girar' => (bool) env('ROLLOS_ETIQUETA_GIRAR', false),

        // Alto del código de barras en píxeles del PNG que se incrusta.
        'barras_alto' => 60,
        'barras_ancho_barra' => 2,

        // Lado del QR en píxeles.
        'qr_lado' => 220,
    ],

];
