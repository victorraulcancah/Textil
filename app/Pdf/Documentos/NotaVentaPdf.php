<?php

namespace App\Pdf\Documentos;

use App\Models\NotaVenta;
use App\Pdf\DocumentoPdf;
use App\Pdf\MontoEnLetras;

class NotaVentaPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.nota-venta';
    }

    public function formatos(): array
    {
        // La nota de venta se imprime en A4 (archivo) y en ticket (caja).
        return ['a4', 'ticket'];
    }

    public function datos(int $id): array
    {
        $venta = NotaVenta::with([
            'cliente',
            'almacen:id,nombre',
            'vendedor:id,name',
            'detalles.presentacion.producto:id,codigo,nombre',
            'pagos',
        ])->findOrFail($id);

        $documento = "{$venta->serie}-" . str_pad((string) $venta->numero, 8, '0', STR_PAD_LEFT);

        $filas = $venta->detalles->map(function ($d, $i) {
            $prod = $d->presentacion?->producto;
            return [
                'n' => $i + 1,
                'codigo' => $prod?->codigo ?? '—',
                'producto' => $prod?->nombre ?? '—',
                'unidad' => $d->presentacion?->nombre ?? '—',
                'cantidad' => number_format((float) $d->cantidad, 2),
                'precio' => number_format((float) $d->precio_unitario, 2),
                'subtotal' => number_format((float) $d->subtotal, 2),
                // Para el ticket (nombre + línea de detalle + importe).
                'nombre' => $prod?->nombre ?? '—',
                'detalle' => number_format((float) $d->cantidad, 2) . ' ' . ($d->presentacion?->nombre ?? '') . ' x ' . number_format((float) $d->precio_unitario, 2),
                'importe' => number_format((float) $d->subtotal, 2),
            ];
        })->all();

        $formaPago = [
            'efectivo' => 'Efectivo', 'transferencia' => 'Transferencia',
            'billetera' => 'Billetera', 'tarjeta' => 'Tarjeta', 'credito' => 'Crédito',
        ];
        $pagos = $venta->pagos->map(fn ($p) => [
            'metodo' => $formaPago[$p->forma_pago] ?? ucfirst((string) $p->forma_pago),
            'monto' => number_format((float) $p->monto, 2),
        ])->all();

        return [
            'venta' => $venta,
            'documento' => $documento,
            'filas' => $filas,
            'pagos' => $pagos,
            'enLetras' => MontoEnLetras::convertir((float) $venta->total, $venta->moneda === 'USD' ? 'DÓLARES' : 'SOLES'),
            'moneda' => $venta->moneda === 'USD' ? '$' : 'S/',
        ];
    }

    public function archivo(int $id): string
    {
        $venta = NotaVenta::findOrFail($id);

        return 'nota-venta-' . $venta->serie . '-' . str_pad((string) $venta->numero, 8, '0', STR_PAD_LEFT);
    }
}
