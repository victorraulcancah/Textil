<?php

namespace App\Pdf;

use App\Models\Compra;
use App\Models\NotaVenta;
use App\Models\OrdenCompra;
use App\Models\OrdenVenta;

/**
 * La planilla de telas, en el formato de las hojas de Excel del cliente, para
 * el pedido y la proforma (el mismo que pinta <PlanillaTela /> en pantalla):
 *
 *   01-01 TELA: POLINAN CE
 *   ITEM · COLOR · ROLLO · FACTOR · METROS · PRECIO UNITARIO · PRECIO TOTAL
 *   una fila por rollo, SUB TOTAL por tela y TOTAL al final.
 *
 * Cada constructor devuelve ['grupos' => [...], 'totales' => [...]]. En una
 * fila, factor / metros / total son número, null (no aplica) o el texto
 * "Por definir" (el almacén todavía no separó el rollo).
 */
class PlanillaTela
{
    public const PENDIENTE = 'Por definir';

    /** "01-01-001": el código de la tela y, si lo hay, el de su color. */
    private static function item(?string $producto, ?string $color): string
    {
        return collect([$producto, $color])->filter()->implode('-') ?: '—';
    }

    private static function titulo(bool $esTela, ?string $codigo, ?string $nombre): string
    {
        return trim(($codigo ?? '').' '.($esTela ? 'TELA' : 'PRODUCTO').': '.($nombre ?? '—'));
    }

    /** Junta las filas por producto y suma rollos, metros y total de cada grupo. */
    private static function agrupar(array $lineas): array
    {
        $grupos = [];

        foreach ($lineas as $l) {
            $g = &$grupos[$l['grupo']];
            $g ??= ['titulo' => $l['titulo'], 'filas' => [], 'rollos' => 0, 'metros' => 0.0, 'total' => 0.0];
            $g['filas'][] = $l['fila'];
            $g['rollos'] += $l['rollos'];
            $g['metros'] += is_numeric($l['fila']['metros']) ? (float) $l['fila']['metros'] : 0;
            $g['total'] += is_numeric($l['fila']['total']) ? (float) $l['fila']['total'] : 0;
            unset($g);
        }

        $grupos = array_values($grupos);

        return [
            'grupos' => $grupos,
            'totales' => [
                'rollos' => array_sum(array_column($grupos, 'rollos')),
                'metros' => array_sum(array_column($grupos, 'metros')),
                'total' => array_sum(array_column($grupos, 'total')),
            ],
        ];
    }

    public static function deOrdenCompra(OrdenCompra $orden): array
    {
        return self::deLineasDeCompra($orden->detalles, 'precio_unitario');
    }

    public static function deCompra(Compra $compra): array
    {
        return self::deLineasDeCompra($compra->detalles, 'costo_unitario');
    }

    /**
     * Una orden de compra o una compra: cada color de una tela con sus rollos y
     * su factor (los metros de cada rollo). Lo que no es tela va con su unidad.
     * `color_code` es el código que se escribió en la línea.
     */
    private static function deLineasDeCompra($detalles, string $campoPrecio): array
    {
        $lineas = [];

        foreach ($detalles as $d) {
            $producto = $d->presentacion?->producto;
            $esTela = $d->presentacion?->unidadBase && strtolower((string) $d->presentacion->unidadBase->abreviatura) === 'm';
            $rollos = (int) ($d->rollos ?? 0);
            $cantidad = (float) $d->cantidad;

            $lineas[] = [
                'grupo' => (string) ($producto?->id ?? 0),
                'titulo' => self::titulo((bool) $esTela, $producto?->codigo, $producto?->nombre),
                'rollos' => $rollos,
                'fila' => [
                    'item' => self::item($producto?->codigo, $d->color?->codigo),
                    'color_code' => $d->color_code,
                    'color' => $d->color?->nombre ?? '',
                    'rollo' => $esTela ? ($rollos > 0 ? "{$rollos}R" : '') : ($d->presentacion?->nombre ?? ''),
                    'factor' => $esTela && $rollos > 0 ? round($cantidad / $rollos, 2) : null,
                    'metros' => $cantidad,
                    'precio' => (float) $d->{$campoPrecio},
                    'total' => (float) $d->subtotal,
                ],
            ];
        }

        return self::agrupar($lineas);
    }

    /** Una proforma: cada línea ya es un rollo (o un corte, o algo que no es tela). */
    public static function deNota(NotaVenta $venta): array
    {
        $lineas = [];

        foreach ($venta->detalles as $d) {
            $producto = $d->presentacion?->producto;
            $f = $d->filaProforma();
            $esTela = $d->rollo_id !== null || $f['u'] === 'R' || $f['u'] === '';
            $entero = $f['u'] === 'R';

            $lineas[] = [
                'grupo' => (string) ($producto?->id ?? 0),
                'titulo' => self::titulo($esTela, $producto?->codigo, $producto?->nombre),
                'rollos' => $entero ? 1 : 0,
                'fila' => [
                    'item' => self::item($producto?->codigo, $d->rollo?->color?->codigo),
                    'color' => $f['color'] ?: '',
                    'rollo' => $esTela ? ($entero ? '1R' : 'Corte') : $f['u'],
                    'factor' => $esTela && $d->metros_rollo !== null ? (float) $d->metros_rollo : null,
                    'metros' => (float) $f['cantidad'],
                    'precio' => (float) $f['precio'],
                    'total' => (float) $d->subtotal,
                ],
            ];
        }

        return self::agrupar($lineas);
    }

    /**
     * Un pedido: los rollos que el almacén ya asignó van uno por fila, con su
     * metraje real; lo que falta por separar sale como "N R" por definir.
     */
    public static function dePedido(OrdenVenta $orden): array
    {
        $lineas = [];

        foreach ($orden->detalles as $d) {
            $producto = $d->presentacion?->producto;
            $esTela = $d->esPorRollos() || $d->color !== null;
            $grupo = (string) ($producto?->id ?? 0);
            $titulo = self::titulo($esTela, $producto?->codigo, $producto?->nombre);
            $precio = $d->precio_oculto ? null : (float) $d->precio_unitario;
            $color = $d->color?->nombre ?? '';
            $itemLinea = self::item($producto?->codigo, $d->color?->codigo);
            $importe = fn (float $metros) => $precio === null ? null : round($metros * $precio, 2);

            if (! $d->esPorRollos()) {
                $lineas[] = [
                    'grupo' => $grupo, 'titulo' => $titulo, 'rollos' => 0,
                    'fila' => [
                        'item' => $itemLinea, 'color' => $color,
                        'rollo' => $esTela ? '' : ($d->presentacion?->nombre ?? ''),
                        'factor' => null,
                        'metros' => $esTela ? (float) $d->metros : (float) $d->cantidad,
                        'precio' => $precio,
                        'total' => $precio === null ? null : (float) $d->subtotal,
                    ],
                ];
                continue;
            }

            foreach ($d->rollos as $r) {
                $parcial = $r->esParcial();
                $lineas[] = [
                    'grupo' => $grupo, 'titulo' => $titulo, 'rollos' => $parcial ? 0 : 1,
                    'fila' => [
                        'item' => self::item($producto?->codigo, $r->rollo?->color?->codigo ?? $d->color?->codigo),
                        'color' => $r->rollo?->color?->nombre ?? $color,
                        'rollo' => $parcial ? 'Corte' : '1R',
                        'factor' => (float) ($r->metros_rollo ?? $r->rollo?->metros_inicial ?? $r->metros),
                        'metros' => (float) $r->metros,
                        'precio' => $precio,
                        'total' => $importe((float) $r->metros),
                    ],
                ];
            }

            // Lo que todavía no tiene rollo.
            $faltan = (int) $d->rollosPendientes();
            if ($faltan > 0) {
                $lineas[] = [
                    'grupo' => $grupo, 'titulo' => $titulo, 'rollos' => $faltan,
                    'fila' => [
                        'item' => $itemLinea, 'color' => $color, 'rollo' => "{$faltan}R",
                        'factor' => self::PENDIENTE, 'metros' => self::PENDIENTE,
                        'precio' => $precio, 'total' => self::PENDIENTE,
                    ],
                ];
            }
        }

        return self::agrupar($lineas);
    }
}
