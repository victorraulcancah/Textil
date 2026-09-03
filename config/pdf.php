<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Formato ticket
    |--------------------------------------------------------------------------
    | Ancho del papel de la impresora térmica en milímetros (80 o 58). El alto
    | es automático: crece con el contenido. dompdf trabaja en puntos (1mm ≈
    | 2.8346pt), la conversión la hace PdfService.
    */
    'ticket' => [
        'ancho_mm' => 80,
        'margen_mm' => 4,
    ],

    /*
    |--------------------------------------------------------------------------
    | Pie legal
    |--------------------------------------------------------------------------
    | Texto que aparece al pie de todos los documentos (no es comprobante
    | electrónico salvo que se indique lo contrario).
    */
    'pie_legal' => 'Documento interno de control. No es comprobante de pago electrónico.',

    /*
    |--------------------------------------------------------------------------
    | Registro de documentos
    |--------------------------------------------------------------------------
    | Mapea el {tipo} de la ruta /pdf/{tipo}/{id} a la clase que sabe armar
    | los datos. Agregar un documento nuevo = una clase + un blade + una línea
    | aquí.
    */
    'documentos' => [
        'nota-venta' => \App\Pdf\Documentos\NotaVentaPdf::class,
        'orden-compra' => \App\Pdf\Documentos\OrdenCompraPdf::class,
        'compra' => \App\Pdf\Documentos\CompraPdf::class,
        'recepcion-compra' => \App\Pdf\Documentos\RecepcionCompraPdf::class,
        'guia-traslado' => \App\Pdf\Documentos\GuiaTrasladoPdf::class,
        'prestamo' => \App\Pdf\Documentos\PrestamoPdf::class,
        'ajuste' => \App\Pdf\Documentos\AjustePdf::class,
        'cierre-caja' => \App\Pdf\Documentos\CierreCajaPdf::class,
        'movimiento-caja' => \App\Pdf\Documentos\MovimientoCajaPdf::class,
    ],

];
