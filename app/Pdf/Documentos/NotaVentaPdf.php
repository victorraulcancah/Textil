<?php

namespace App\Pdf\Documentos;

use App\Models\NotaVenta;
use App\Pdf\DocumentoPdf;
use App\Pdf\MontoEnLetras;
use App\Pdf\PlanillaTela;

class NotaVentaPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.nota-venta';
    }

    public function formatos(): array
    {
        // La proforma se imprime en A4 (archivo) y en ticket (caja).
        return ['a4', 'ticket'];
    }

    public function datos(int $id): array
    {
        $venta = NotaVenta::with([
            'cliente',
            'almacen:id,nombre',
            'vendedor:id,name',
            'detalles.presentacion.unidadBase',
            'detalles.presentacion.producto.presentaciones.unidadBase',
            'detalles.rollo.color:id,nombre,codigo',
            'pagos',
        ])->findOrFail($id);

        $documento = "{$venta->serie}-" . str_pad((string) $venta->numero, 8, '0', STR_PAD_LEFT);
        $n = fn ($v) => number_format((float) $v, 2);
        // Metros y cantidades sin ceros de relleno: 58, 35.5.
        $q = fn ($v) => rtrim(rtrim(number_format((float) $v, 2, '.', ''), '0'), '.');

        // Rollo por rollo, agrupado por producto: cada producto con su banda y su
        // propio ítem (1, 2…). Las columnas: Ítem | Color | Cantidad (m) | U. | Precio | Subtotal.
        $grupos = $venta->detalles
            ->groupBy(fn ($d) => $d->presentacion?->producto_id ?? 0)
            ->map(function ($lineas) use ($n, $q) {
                return [
                    'producto' => $lineas->first()->presentacion?->producto?->nombre ?? '—',
                    'filas' => $lineas->values()->map(function ($d, $i) use ($n, $q) {
                        $f = $d->filaProforma();

                        return [
                            'n' => $i + 1,
                            'color' => $f['color'] ?: '—',
                            'cantidad' => $q($f['cantidad']),
                            'u' => $f['u'],
                            'precio' => $n($f['precio']),
                            'subtotal' => $n($d->subtotal),
                        ];
                    })->all(),
                ];
            })
            ->values()
            ->all();

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
            'grupos' => $grupos,
            // El formato de la planilla del cliente (A4): una tabla por tela, rollo por rollo.
            'planilla' => PlanillaTela::deNota($venta),
            'pagos' => $pagos,
            'enLetras' => MontoEnLetras::convertir((float) $venta->total, $venta->moneda === 'USD' ? 'DÓLARES' : 'SOLES'),
            'moneda' => $venta->moneda === 'USD' ? '$' : 'S/',
        ];
    }

    public function archivo(int $id): string
    {
        $venta = NotaVenta::findOrFail($id);

        return 'proforma-' . $venta->serie . '-' . str_pad((string) $venta->numero, 8, '0', STR_PAD_LEFT);
    }
}
