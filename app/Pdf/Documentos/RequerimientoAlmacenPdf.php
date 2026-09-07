<?php

namespace App\Pdf\Documentos;

use App\Models\OrdenVenta;
use App\Pdf\DocumentoPdf;

/**
 * El papel que baja al almacén: qué rollos hay que bajar del rack.
 *
 * Es el mismo pedido, impreso para otra persona y con otra información: aquí
 * no interesan los precios sino el código del rollo, su metraje y dónde está.
 * Lleva una casilla para marcar a mano, por si la pistola falla.
 */
class RequerimientoAlmacenPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.requerimiento-almacen';
    }

    public function formatos(): array
    {
        return ['a4'];
    }

    public function datos(int $id): array
    {
        $orden = OrdenVenta::with([
            'cliente:id,nombre',
            'almacen:id,nombre',
            'vendedor:id,name',
            'usuarioPrepara:id,name',
            'detalles.rollo.producto:id,codigo,nombre',
            'detalles.rollo.color',
            'detalles.rollo.almacen:id,nombre',
        ])->findOrFail($id);

        // Ordenado por ubicación: el almacenero recorre el rack una sola vez.
        $filas = $orden->detalles
            ->sortBy(fn ($d) => [$d->rollo?->pasillo, $d->rollo?->rack, $d->rollo?->nivel, $d->rollo?->codigo])
            ->values()
            ->map(fn ($d, $i) => [
                'n' => $i + 1,
                'codigo' => $d->rollo?->codigo ?? '—',
                'producto' => $d->rollo?->producto?->nombre ?? '—',
                'color' => $d->rollo?->color?->nombre ?? '—',
                'metros' => number_format((float) $d->metros, 2),
                'parcial' => (float) $d->metros < (float) ($d->rollo?->metros_actual ?? 0),
                'ubicacion' => $d->rollo?->ubicacionLegible() ?? '—',
                'escaneado' => (bool) $d->escaneado_at,
            ])
            ->all();

        return [
            'orden' => $orden,
            'documento' => $orden->requerimiento_numero ?? $orden->documento,
            'filas' => $filas,
            'total_rollos' => count($filas),
            'total_metros' => number_format((float) $orden->detalles->sum('metros'), 2),
        ];
    }

    public function archivo(int $id): string
    {
        $orden = OrdenVenta::findOrFail($id);

        return 'requerimiento-'.($orden->requerimiento_numero ?? $orden->documento);
    }
}
