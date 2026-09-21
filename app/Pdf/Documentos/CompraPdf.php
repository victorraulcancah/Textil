<?php

namespace App\Pdf\Documentos;

use App\Models\Compra;
use App\Pdf\DocumentoPdf;
use App\Pdf\MontoEnLetras;
use App\Pdf\ProductoConColor;

class CompraPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.compra';
    }

    public function formatos(): array
    {
        return ['a4', 'ticket'];
    }

    public function datos(int $id): array
    {
        $compra = Compra::with([
            'proveedor',
            'ordenCompra:id,codigo',
            'usuario:id,name',
            'detalles.presentacion.producto:id,codigo,nombre',
            'detalles.color:id,codigo,nombre',
        ])->findOrFail($id);

        $filas = $compra->detalles->map(fn ($d, $i) => [
            'n' => $i + 1,
            'codigo' => ProductoConColor::codigo($d->presentacion?->producto, $d->color),
            'producto' => ProductoConColor::nombre($d->presentacion?->producto, $d->color),
            'unidad' => $d->presentacion?->nombre ?? '—',
            'cantidad' => number_format((float) $d->cantidad, 2),
            'precio' => number_format((float) $d->costo_unitario, 2),
            'subtotal' => number_format((float) $d->subtotal, 2),
            // Para el ticket.
            'nombre' => ProductoConColor::nombre($d->presentacion?->producto, $d->color),
            'detalle' => number_format((float) $d->cantidad, 2) . ' ' . ($d->presentacion?->nombre ?? '') . ' x ' . number_format((float) $d->costo_unitario, 2),
            'importe' => number_format((float) $d->subtotal, 2),
        ])->all();

        $dolares = $compra->moneda_origen === 'USD';
        $tipoDoc = ['factura' => 'Factura', 'boleta' => 'Boleta', 'guia' => 'Guía', 'ticket' => 'Ticket'];
        $docProveedor = trim(($compra->serie ?? '') . ($compra->numero ? '-' . $compra->numero : ''));

        return [
            'compra' => $compra,
            'documento' => $compra->numero_compra ?? ('#' . $compra->id),
            'tipoDocLabel' => $tipoDoc[$compra->tipo_documento] ?? ucfirst((string) $compra->tipo_documento),
            'docProveedor' => $docProveedor !== '' ? $docProveedor : '—',
            'filas' => $filas,
            'total' => (float) $compra->total,
            // Los importes de la compra están en la moneda en que se pactó con
            // el proveedor; el tipo de cambio solo sirve para pasarla a soles
            // cuando la mercadería entra al almacén.
            'moneda' => $dolares ? '$' : 'S/',
            'monedaLabel' => $dolares
                ? 'Dólares' . ($compra->tipo_cambio ? ' (T.C. ' . number_format((float) $compra->tipo_cambio, 4) . ')' : '')
                : 'Soles',
            'enLetras' => MontoEnLetras::convertir((float) $compra->total, $dolares ? 'DÓLARES' : 'SOLES'),
        ];
    }

    public function archivo(int $id): string
    {
        $compra = Compra::findOrFail($id);

        return 'compra-' . ($compra->numero_compra ?? $compra->id);
    }
}
