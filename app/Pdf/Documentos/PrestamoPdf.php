<?php

namespace App\Pdf\Documentos;

use App\Models\Prestamo;
use App\Pdf\DocumentoPdf;

class PrestamoPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.prestamo';
    }

    public function formatos(): array
    {
        return ['a4', 'ticket'];
    }

    public function datos(int $id): array
    {
        $prestamo = Prestamo::with([
            'almacen:id,nombre',
            'usuario:id,name',
            'detalles.presentacion.producto:id,codigo,nombre',
            'devoluciones',
        ])->findOrFail($id);

        // Devuelto acumulado por presentación.
        $devueltos = $prestamo->devoluciones->groupBy('producto_presentacion_id')
            ->map(fn ($g) => (float) $g->sum('cantidad'));

        $filas = $prestamo->detalles->map(function ($d, $i) use ($devueltos) {
            $dev = $devueltos[$d->producto_presentacion_id] ?? 0.0;
            $pend = max(0, (float) $d->cantidad_prestada - $dev);

            return [
                'n' => $i + 1,
                'codigo' => $d->presentacion?->producto?->codigo ?? '—',
                'producto' => $d->presentacion?->producto?->nombre ?? '—',
                'unidad' => $d->presentacion?->nombre ?? '—',
                'prestado' => number_format((float) $d->cantidad_prestada, 2),
                'devuelto' => number_format($dev, 2),
                'pendiente' => number_format($pend, 2),
                // Ticket
                'nombre' => $d->presentacion?->producto?->nombre ?? '—',
                'detalle' => 'Prest ' . number_format((float) $d->cantidad_prestada, 2) . ' ' . ($d->presentacion?->nombre ?? ''),
                'importe' => 'Pend ' . number_format($pend, 2),
            ];
        })->all();

        return [
            'filas' => $filas,
            'prestamo' => $prestamo,
            'documento' => $prestamo->documento ?? ('#' . $prestamo->id),
            'esPrestado' => $prestamo->tipo === 'prestado',
        ];
    }

    public function archivo(int $id): string
    {
        $prestamo = Prestamo::findOrFail($id);

        return 'prestamo-' . ($prestamo->documento ?? $prestamo->id);
    }
}
