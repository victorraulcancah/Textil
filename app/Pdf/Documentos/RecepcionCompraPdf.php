<?php

namespace App\Pdf\Documentos;

use App\Models\RecepcionCompra;
use App\Pdf\DocumentoPdf;

class RecepcionCompraPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.recepcion-compra';
    }

    public function formatos(): array
    {
        return ['a4', 'ticket'];
    }

    public function datos(int $id): array
    {
        $recepcion = RecepcionCompra::with([
            'proveedor',
            'almacen:id,nombre',
            'compra:id,correlativo',
            'ordenCompra:id,codigo',
            'usuarioRecibe:id,name',
            'detalles.presentacion.producto:id,codigo,nombre',
        ])->findOrFail($id);

        $filas = $recepcion->detalles->map(fn ($d, $i) => [
            'n' => $i + 1,
            'codigo' => $d->presentacion?->producto?->codigo ?? '—',
            'producto' => $d->presentacion?->producto?->nombre ?? '—',
            'unidad' => $d->presentacion?->nombre ?? '—',
            'pedida' => number_format((float) $d->cantidad_ordenada, 2),
            'recibida' => number_format((float) $d->cantidad_recibida, 2),
            'conforme' => number_format((float) $d->cantidad_conforme, 2),
            'rechazada' => number_format((float) $d->cantidad_rechazada, 2),
            // Para el ticket (la recepción no maneja importes).
            'nombre' => $d->presentacion?->producto?->nombre ?? '—',
            'detalle' => 'Rec ' . number_format((float) $d->cantidad_recibida, 2) . ' ' . ($d->presentacion?->nombre ?? ''),
            'importe' => 'Conf ' . number_format((float) $d->cantidad_conforme, 2),
        ])->all();

        return [
            'recepcion' => $recepcion,
            'documento' => $recepcion->documento ?? ('#' . $recepcion->id),
            'compraRef' => $recepcion->compra?->correlativo ? 'C001-' . str_pad((string) $recepcion->compra->correlativo, 8, '0', STR_PAD_LEFT) : null,
            'ordenRef' => $recepcion->ordenCompra?->codigo,
            'filas' => $filas,
        ];
    }

    public function archivo(int $id): string
    {
        $recepcion = RecepcionCompra::findOrFail($id);

        return 'recepcion-' . ($recepcion->documento ?? $recepcion->id);
    }
}
