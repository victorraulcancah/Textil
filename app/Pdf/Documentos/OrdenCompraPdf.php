<?php

namespace App\Pdf\Documentos;

use App\Models\OrdenCompra;
use App\Pdf\DocumentoPdf;
use App\Pdf\MontoEnLetras;

class OrdenCompraPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.orden-compra';
    }

    public function formatos(): array
    {
        return ['a4', 'ticket'];
    }

    public function datos(int $id): array
    {
        $orden = OrdenCompra::with([
            'proveedor',
            'usuarioCrea:id,name',
            'detalles.presentacion.producto:id,codigo,nombre',
        ])->findOrFail($id);

        $filas = $orden->detalles->map(fn ($d, $i) => [
            'n' => $i + 1,
            'codigo' => $d->presentacion?->producto?->codigo ?? '—',
            'producto' => $d->presentacion?->producto?->nombre ?? '—',
            'unidad' => $d->presentacion?->nombre ?? '—',
            'cantidad' => number_format((float) $d->cantidad, 2),
            'precio' => number_format((float) $d->precio_unitario, 2),
            'subtotal' => number_format((float) $d->subtotal, 2),
            // Para el ticket (nombre + línea de detalle + importe).
            'nombre' => $d->presentacion?->producto?->nombre ?? '—',
            'detalle' => number_format((float) $d->cantidad, 2) . ' ' . ($d->presentacion?->nombre ?? '') . ' x ' . number_format((float) $d->precio_unitario, 2),
            'importe' => number_format((float) $d->subtotal, 2),
        ])->all();

        $total = (float) $orden->detalles->sum('subtotal');
        $moneda = $orden->moneda === 'USD' ? '$' : 'S/';

        return [
            'orden' => $orden,
            'documento' => $orden->codigo,
            'filas' => $filas,
            'total' => $total,
            'moneda' => $moneda,
            'enLetras' => MontoEnLetras::convertir($total, $orden->moneda === 'USD' ? 'DÓLARES' : 'SOLES'),
        ];
    }

    public function archivo(int $id): string
    {
        return 'orden-compra-' . OrdenCompra::findOrFail($id)->codigo;
    }
}
