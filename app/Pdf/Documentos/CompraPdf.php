<?php

namespace App\Pdf\Documentos;

use App\Models\Compra;
use App\Pdf\DocumentoPdf;
use App\Pdf\MontoEnLetras;

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
        ])->findOrFail($id);

        $filas = $compra->detalles->map(fn ($d, $i) => [
            'n' => $i + 1,
            'codigo' => $d->presentacion?->producto?->codigo ?? '—',
            'producto' => $d->presentacion?->producto?->nombre ?? '—',
            'unidad' => $d->presentacion?->nombre ?? '—',
            'cantidad' => number_format((float) $d->cantidad, 2),
            'precio' => number_format((float) $d->costo_unitario, 2),
            'subtotal' => number_format((float) $d->subtotal, 2),
            // Para el ticket.
            'nombre' => $d->presentacion?->producto?->nombre ?? '—',
            'detalle' => number_format((float) $d->cantidad, 2) . ' ' . ($d->presentacion?->nombre ?? '') . ' x ' . number_format((float) $d->costo_unitario, 2),
            'importe' => number_format((float) $d->subtotal, 2),
        ])->all();

        $tipoDoc = ['factura' => 'Factura', 'boleta' => 'Boleta', 'guia' => 'Guía', 'ticket' => 'Ticket'];
        $docProveedor = trim(($compra->serie ?? '') . ($compra->numero ? '-' . $compra->numero : ''));

        return [
            'compra' => $compra,
            'documento' => $compra->numero_compra ?? ('#' . $compra->id),
            'tipoDocLabel' => $tipoDoc[$compra->tipo_documento] ?? ucfirst((string) $compra->tipo_documento),
            'docProveedor' => $docProveedor !== '' ? $docProveedor : '—',
            'filas' => $filas,
            'total' => (float) $compra->total,
            'moneda' => 'S/',
            'enLetras' => MontoEnLetras::convertir((float) $compra->total, 'SOLES'),
        ];
    }

    public function archivo(int $id): string
    {
        $compra = Compra::findOrFail($id);

        return 'compra-' . ($compra->numero_compra ?? $compra->id);
    }
}
