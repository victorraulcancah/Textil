<?php

namespace App\Pdf\Documentos;

use App\Models\NotaVenta;
use App\Pdf\DocumentoPdf;
use App\Pdf\MontoEnLetras;

class NotaVentaPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.nota-venta';
    }

    public function formatos(): array
    {
        // La nota de venta se imprime en A4 (archivo) y en ticket (caja).
        return ['a4', 'ticket'];
    }

    public function datos(int $id): array
    {
        $venta = NotaVenta::with([
            'cliente',
            'almacen:id,nombre',
            'vendedor:id,name',
            'detalles.presentacion.producto.presentaciones.unidadBase',
            'detalles.rollo.color:id,nombre,codigo',
            'pagos',
        ])->findOrFail($id);

        $documento = "{$venta->serie}-" . str_pad((string) $venta->numero, 8, '0', STR_PAD_LEFT);
        $n = fn ($v) => number_format((float) $v, 2);

        // La tela que sale de rollos va agrupada por tela: una fila por rollo,
        // con su metraje real (el "factor") al precio del metro. Lo demás
        // (y la tela vendida sin rollo) va en la tabla de siempre.
        [$conRollo, $sinRollo] = $venta->detalles->partition(fn ($d) => $d->rollo_id !== null);

        $telas = $conRollo
            ->groupBy(fn ($d) => $d->presentacion?->producto_id)
            ->map(function ($lineas) use ($n) {
                $prod = $lineas->first()->presentacion?->producto;
                $filas = $lineas
                    ->sortBy(fn ($d) => $d->rollo?->color?->nombre)
                    ->values()
                    ->map(function ($d) use ($prod) {
                        $color = $d->rollo?->color;
                        $metros = $d->presentacion->aMetros((float) $d->cantidad);
                        $porMetro = $d->presentacion->aMetros(1);

                        return [
                            // Tela + color, como el código del muestrario (01-01-001-0074).
                            'item' => implode('-', array_filter([$prod?->codigo, $color?->codigo])) ?: '—',
                            'color' => $color?->nombre ?? '—',
                            'entero' => (bool) $d->rollo_entero,
                            'factor' => (float) ($d->metros_rollo ?? $metros),
                            'metros' => $metros,
                            'precio' => $porMetro > 0 ? (float) $d->precio_unitario / $porMetro : (float) $d->precio_unitario,
                            // Sin el descuento: ese va en los totales de la nota.
                            'total' => (float) $d->subtotal + (float) $d->descuento,
                        ];
                    });

                $cortes = $filas->where('entero', false)->count();

                return [
                    'producto' => $prod?->nombre ?? '—',
                    'filas' => $filas->map(fn ($f) => [
                        'item' => $f['item'],
                        'color' => $f['color'],
                        'rollo' => $f['entero'] ? '1' : 'Corte',
                        'factor' => $f['entero'] ? $n($f['factor']) : '—',
                        'metros' => $n($f['metros']),
                        'precio' => $n($f['precio']),
                        'total' => $n($f['total']),
                    ])->all(),
                    'rollos' => $filas->where('entero', true)->count(),
                    'cortes' => $cortes ? $cortes.($cortes === 1 ? ' corte' : ' cortes') : null,
                    'metros' => $n($filas->sum('metros')),
                    'total' => $n($filas->sum('total')),
                ];
            })
            ->values()
            ->all();

        $filas = $sinRollo->values()->map(function ($d, $i) {
            $prod = $d->presentacion?->producto;
            return [
                'n' => $i + 1,
                'codigo' => $prod?->codigo ?? '—',
                'producto' => $prod?->nombre ?? '—',
                'unidad' => $d->presentacion?->nombre ?? '—',
                'cantidad' => number_format((float) $d->cantidad, 2),
                'precio' => number_format((float) $d->precio_unitario, 2),
                'subtotal' => number_format((float) $d->subtotal, 2),
            ];
        })->all();

        // El ticket: nombre, una línea de detalle e importe, rollo por rollo.
        $filasTicket = $venta->detalles->map(function ($d) use ($n) {
            $prod = $d->presentacion?->producto;
            $color = $d->rollo?->color?->nombre;

            if ($d->rollo_id) {
                $metros = $d->presentacion->aMetros((float) $d->cantidad);
                $porMetro = $d->presentacion->aMetros(1);
                $precio = $porMetro > 0 ? (float) $d->precio_unitario / $porMetro : (float) $d->precio_unitario;

                return [
                    'nombre' => trim(($prod?->nombre ?? '—').' '.($color ?? '')),
                    'detalle' => ($d->rollo_entero ? 'Rollo ' : 'Corte ').$n($metros).' m x '.$n($precio),
                    'importe' => $n($d->subtotal),
                ];
            }

            return [
                'nombre' => $prod?->nombre ?? '—',
                'detalle' => $n($d->cantidad) . ' ' . ($d->presentacion?->nombre ?? '') . ' x ' . $n($d->precio_unitario),
                'importe' => $n($d->subtotal),
            ];
        })->all();

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
            'filas' => $filas,
            'telas' => $telas,
            'filasTicket' => $filasTicket,
            'pagos' => $pagos,
            'enLetras' => MontoEnLetras::convertir((float) $venta->total, $venta->moneda === 'USD' ? 'DÓLARES' : 'SOLES'),
            'moneda' => $venta->moneda === 'USD' ? '$' : 'S/',
        ];
    }

    public function archivo(int $id): string
    {
        $venta = NotaVenta::findOrFail($id);

        return 'nota-venta-' . $venta->serie . '-' . str_pad((string) $venta->numero, 8, '0', STR_PAD_LEFT);
    }
}
