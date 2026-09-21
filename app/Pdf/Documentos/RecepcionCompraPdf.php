<?php

namespace App\Pdf\Documentos;

use App\Models\RecepcionCompra;
use App\Pdf\DocumentoPdf;
use App\Pdf\ProductoConColor;

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
            'detalles.compraDetalle.color:id,codigo,nombre',
            'rollos' => fn ($q) => $q->orderBy('producto_id')->orderBy('producto_color_id')->orderBy('numero'),
            'rollos.producto:id,codigo,nombre',
            'rollos.color:id,codigo,nombre',
            'rollos.usuarioRecibe:id,name',
        ])->findOrFail($id);

        $filas = $recepcion->detalles->map(function ($d, $i) {
            $producto = $d->presentacion?->producto;
            $color = $d->compraDetalle?->color;

            return [
                'n' => $i + 1,
                'codigo' => ProductoConColor::codigo($producto, $color),
                'producto' => ProductoConColor::nombre($producto, $color),
                'unidad' => $d->presentacion?->nombre ?? '—',
                'pedida' => number_format((float) $d->cantidad_ordenada, 2),
                'recibida' => number_format((float) $d->cantidad_recibida, 2),
                'conforme' => number_format((float) $d->cantidad_conforme, 2),
                'rechazada' => number_format((float) $d->cantidad_rechazada, 2),
                // Para el ticket (la recepción no maneja importes).
                'nombre' => ProductoConColor::nombre($producto, $color),
                'detalle' => 'Rec ' . number_format((float) $d->cantidad_recibida, 2) . ' ' . ($d->presentacion?->nombre ?? ''),
                'importe' => 'Conf ' . number_format((float) $d->cantidad_conforme, 2),
            ];
        })->all();

        // Qué rollos llegaron realmente, cada uno con quién lo recibió: el
        // detalle de arriba dice cuántos metros, esto dice con qué piezas.
        $rollos = $recepcion->rollos->map(fn ($r) => [
            'codigo' => $r->codigo,
            'producto' => ProductoConColor::nombre($r->producto, $r->color),
            'metros' => number_format((float) $r->metros_inicial, 2),
            'peso' => $r->peso_kg ? number_format((float) $r->peso_kg, 2) : '—',
            'recibio' => $r->usuarioRecibe?->name ?? '—',
        ])->all();

        return [
            'recepcion' => $recepcion,
            'documento' => $recepcion->documento ?? ('#' . $recepcion->id),
            'compraRef' => $recepcion->compra?->correlativo ? 'C001-' . str_pad((string) $recepcion->compra->correlativo, 8, '0', STR_PAD_LEFT) : null,
            'ordenRef' => $recepcion->ordenCompra?->codigo,
            'filas' => $filas,
            'rollos' => $rollos,
            'totalRollos' => count($rollos),
            'totalMetrosRollos' => number_format((float) $recepcion->rollos->sum('metros_inicial'), 2),
        ];
    }

    public function archivo(int $id): string
    {
        $recepcion = RecepcionCompra::findOrFail($id);

        return 'recepcion-' . ($recepcion->documento ?? $recepcion->id);
    }
}
