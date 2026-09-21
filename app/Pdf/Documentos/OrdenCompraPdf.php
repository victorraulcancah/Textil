<?php

namespace App\Pdf\Documentos;

use App\Models\OrdenCompra;
use App\Pdf\DocumentoPdf;
use App\Pdf\MontoEnLetras;
use App\Pdf\ProductoConColor;

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
            'detalles.color:id,codigo,nombre',
        ])->findOrFail($id);

        $filas = $orden->detalles->map(fn ($d, $i) => [
            'n' => $i + 1,
            'codigo' => ProductoConColor::codigo($d->presentacion?->producto, $d->color),
            // Si se compra por rollos, la orden dice cuántos: el metraje real
            // de cada uno llega recién con el packing list.
            'producto' => ProductoConColor::nombre($d->presentacion?->producto, $d->color)
                . ($d->rollos ? " ({$d->rollos} " . ($d->rollos == 1 ? 'rollo' : 'rollos') . ')' : ''),
            'unidad' => $d->presentacion?->nombre ?? '—',
            'cantidad' => number_format((float) $d->cantidad, 2),
            'precio' => number_format((float) $d->precio_unitario, 2),
            'subtotal' => number_format((float) $d->subtotal, 2),
            // Para el ticket (nombre + línea de detalle + importe).
            'nombre' => ProductoConColor::nombre($d->presentacion?->producto, $d->color),
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
            // Solo tienen sentido en una compra al exterior; el blade los
            // omite del todo cuando la orden es nacional.
            'datosExterior' => $orden->tipo === 'exterior' ? [
                'Incoterm' => $orden->incoterm ?: '—',
                'Tipo de carga' => $orden->cargo_type ?: '—',
                'Medio de embarque' => $orden->medio_transporte ?: '—',
                'Contenedor' => $orden->numero_contenedor ?: '—',
                'País origen' => $orden->pais_origen ?: '—',
                'País destino' => $orden->pais_destino ?: '—',
                'Puerto embarque' => $orden->puerto_embarque ?: '—',
                'Puerto destino' => $orden->puerto_destino ?: '—',
                'F. embarque est.' => optional($orden->fecha_embarque_estimada)->format('d/m/Y') ?: '—',
                'Elaborado por' => $orden->elaborado_por ?: '—',
                'Aprobado por' => $orden->aprobado_por ?: '—',
            ] : null,
        ];
    }

    public function archivo(int $id): string
    {
        return 'orden-compra-' . OrdenCompra::findOrFail($id)->codigo;
    }
}
