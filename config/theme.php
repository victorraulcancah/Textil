<?php

// Paleta de marca para los documentos PDF (facturas, guías, notas de venta, etc.).
// dompdf no puede leer las variables CSS de resources/css/app.css, así que este
// archivo es el espejo para ese lado. Al re-marcar la app para otra empresa,
// edita este archivo con los MISMOS valores que el bloque @theme de app.css.

return [
    'primary' => '#ef6c00',
    'primary_border' => '#e0902f',
    'warm' => '#5d2e00',
    'edge' => '#e0dad2',
    'marco_border' => '#d9cfc4',
    'text' => '#1f1f1f',
    'muted' => '#6b6b6b',
    'muted_light' => '#8a8a8a',
    'danger' => '#dc2626',
];
