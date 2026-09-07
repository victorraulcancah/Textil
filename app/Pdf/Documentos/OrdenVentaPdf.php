<?php

namespace App\Pdf\Documentos;

use App\Models\OrdenVenta;
use App\Pdf\DocumentoPdf;

/**
 * El pedido impreso: lo que se le muestra o se le manda al cliente.
 *
 * Se agrupa por color, como en la nota de venta que hoy llevan en Excel:
 * el cliente compra "5 rollos de negro, 372 m", no rollo por rollo. El
 * detalle de qué rollos son va debajo, por si lo pide.
 */
class OrdenVentaPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.orden-venta';
    }

    public function formatos(): array
    {
        return ['a4'];
    }

    public function datos(int $id): array
    {
        $orden = $this->cargar($id);

        return [
            'orden' => $orden,
            'documento' => $orden->documento,
            'grupos' => $this->agrupar($orden),
            'filas' => $orden->detalles->map(fn ($d, $i) => [
                'n' => $i + 1,
                'codigo' => $d->rollo?->codigo ?? '—',
                'color' => $d->rollo?->color?->nombre ?? '—',
                'metros' => number_format((float) $d->metros, 2),
                'precio' => number_format((float) $d->precio_unitario, 2),
                'importe' => number_format((float) $d->subtotal, 2),
            ])->all(),
        ];
    }

    /**
     * Resumen por color: rollos y metros, como lo escriben a mano.
     *
     * @return list<array<string, mixed>>
     */
    public function agrupar(OrdenVenta $orden): array
    {
        return $orden->detalles
            ->groupBy(fn ($d) => $d->rollo?->producto_color_id ?? 0)
            ->map(fn ($lineas) => [
                'color' => $lineas->first()->rollo?->color?->nombre ?? 'Sin color',
                'codigo_color' => $lineas->first()->rollo?->color?->codigo,
                'producto' => $lineas->first()->rollo?->producto?->nombre ?? '—',
                'rollos' => $lineas->count(),
                'metros' => number_format((float) $lineas->sum('metros'), 2),
                'importe' => number_format((float) $lineas->sum('subtotal'), 2),
            ])
            ->values()
            ->all();
    }

    public function cargar(int $id): OrdenVenta
    {
        return OrdenVenta::with([
            'cliente',
            'almacen:id,nombre',
            'vendedor:id,name',
            'detalles.rollo.producto:id,codigo,nombre',
            'detalles.rollo.color',
        ])->findOrFail($id);
    }

    public function archivo(int $id): string
    {
        return 'pedido-'.OrdenVenta::findOrFail($id)->documento;
    }
}
