<?php

namespace App\Pdf;

use App\Models\Producto;
use App\Models\ProductoColor;

/**
 * Cómo se nombra en un documento lo que se compra y se vende.
 *
 * La tela sola no dice qué se pidió: "Polinan" puede ser negro o camello. Lo
 * que se compra, se recibe y se despacha es la tela más su color, y su código
 * es el de la tela seguido del código del color: 01-01-001-0074.
 */
class ProductoConColor
{
    /** "01-01-001-0074", o solo el código de la tela si la línea no lleva color. */
    public static function codigo(?Producto $producto, ?ProductoColor $color): string
    {
        $codigo = $producto?->codigo;

        if (! $codigo) {
            return '—';
        }

        return $color?->codigo ? "{$codigo}-{$color->codigo}" : $codigo;
    }

    /** "Polinan · CAMELLO", o solo la tela si la línea no lleva color. */
    public static function nombre(?Producto $producto, ?ProductoColor $color): string
    {
        $nombre = $producto?->nombre ?? '—';

        return $color?->nombre ? "{$nombre} · {$color->nombre}" : $nombre;
    }
}
