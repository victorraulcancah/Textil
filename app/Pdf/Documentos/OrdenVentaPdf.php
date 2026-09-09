<?php

namespace App\Pdf\Documentos;

use App\Models\OrdenVenta;
use App\Pdf\DocumentoPdf;

/**
 * El pedido impreso: lo que se le muestra o se le manda al cliente.
 *
 * Lleva lo que pidió —producto, cantidad y precio—, que es de lo que se habla
 * con el cliente. Los rollos concretos que lo cubren van debajo, y solo
 * aparecen si el almacén ya los asignó.
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
            'filas' => $orden->detalles->map(fn ($d, $i) => [
                'n' => $i + 1,
                'codigo' => $d->presentacion?->producto?->codigo ?? '—',
                'producto' => $d->presentacion?->producto?->nombre ?? '—',
                'presentacion' => $d->presentacion?->nombre ?? '—',
                'cantidad' => number_format((float) $d->cantidad, 2),
                'metros' => number_format((float) $d->metros, 2),
                'precio' => number_format((float) $d->precio_unitario, 2),
                'importe' => number_format((float) $d->subtotal, 2),
            ])->all(),
            'rollos' => $this->rollos($orden),
            'total_metros' => number_format((float) $orden->detalles->sum('metros'), 2),
        ];
    }

    /**
     * Los rollos con los que el almacén cubrió el pedido, si ya los asignó.
     *
     * @return list<array<string, mixed>>
     */
    public function rollos(OrdenVenta $orden): array
    {
        return $orden->detalles
            ->flatMap(fn ($d) => $d->rollos->map(fn ($r) => [
                'codigo' => $r->rollo?->codigo ?? '—',
                'producto' => $d->presentacion?->producto?->nombre ?? '—',
                'color' => $r->rollo?->color?->nombre ?? '—',
                'metros' => number_format((float) $r->metros, 2),
            ]))
            ->values()
            ->all();
    }

    public function cargar(int $id): OrdenVenta
    {
        return OrdenVenta::with([
            'cliente',
            'almacen:id,nombre',
            'vendedor:id,name',
            'detalles.presentacion.producto:id,codigo,nombre',
            'detalles.rollos.rollo.color',
        ])->findOrFail($id);
    }

    public function archivo(int $id): string
    {
        return 'pedido-'.OrdenVenta::findOrFail($id)->documento;
    }
}
