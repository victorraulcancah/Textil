<?php

// Paleta de marca para los documentos PDF (facturas, guías, notas de venta, etc.).
// dompdf no puede leer las variables CSS de resources/css/app.css, así que este
// archivo es el espejo para ese lado. Al re-marcar la app para otra empresa,
// edita este archivo con los MISMOS valores que el bloque @theme de app.css.
//
//   primary        = --color-primary-600
//   primary_border = --color-primary-500
//   warm           = --color-warm-900
//   edge           = --color-edge
//   danger         = --color-danger-600

return [
    'primary' => '#2563eb',
    'primary_border' => '#3b82f6',
    'warm' => '#1e3a8a',
    'edge' => '#e0dad2',
    'marco_border' => '#d9cfc4',
    'text' => '#1f1f1f',
    'muted' => '#6b6b6b',
    'muted_light' => '#8a8a8a',
    'danger' => '#dc2626',
];
