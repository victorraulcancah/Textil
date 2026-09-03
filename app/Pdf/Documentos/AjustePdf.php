<?php

namespace App\Pdf\Documentos;

use App\Models\AjusteInventario;
use App\Pdf\DocumentoPdf;
use App\Pdf\MontoEnLetras;

class AjustePdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.ajuste';
    }

    public function formatos(): array
    {
        return ['a4', 'ticket'];
    }

    public function datos(int $id): array
    {
        $ajuste = AjusteInventario::with([
            'almacen:id,nombre',
            'proveedor:id,nombre',
            'usuarioSolicita:id,name',
            'detalles.presentacion.producto:id,codigo,nombre',
        ])->findOrFail($id);

        $filas = $ajuste->detalles->map(fn ($d, $i) => [
            'n' => $i + 1,
            'codigo' => $d->presentacion?->producto?->codigo ?? '—',
            'producto' => $d->presentacion?->producto?->nombre ?? '—',
            'unidad' => $d->presentacion?->nombre ?? '—',
            'cantidad' => number_format((float) $d->cantidad, 2),
            'costo' => number_format((float) $d->costo_unitario, 2),
            'subtotal' => number_format((float) $d->subtotal, 2),
            // Ticket
            'nombre' => $d->presentacion?->producto?->nombre ?? '—',
            'detalle' => number_format((float) $d->cantidad, 2) . ' ' . ($d->presentacion?->nombre ?? '') . ' x ' . number_format((float) $d->costo_unitario, 2),
            'importe' => number_format((float) $d->subtotal, 2),
        ])->all();

        $total = (float) $ajuste->total;

        return [
            'filas' => $filas,
            'ajuste' => $ajuste,
            'documento' => $ajuste->documento ?? ('#' . $ajuste->id),
            'esEntrada' => $ajuste->tipo === 'entrada',
            'total' => $total,
            'enLetras' => MontoEnLetras::convertir($total, 'SOLES'),
        ];
    }

    public function archivo(int $id): string
    {
        $ajuste = AjusteInventario::findOrFail($id);

        return 'ajuste-' . ($ajuste->documento ?? $ajuste->id);
    }
}
