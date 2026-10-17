<?php

namespace App\Support;

class Moneda
{
    /**
     * Un precio unitario tal como se escribió: con 2 decimales como mínimo y hasta 6 si los tiene (6.22, 6.216935), sin
     * ceros de relleno. Los importes siguen mostrándose con 2 decimales.
     */
    public static function precio(float|int|string|null $valor, bool $miles = true): string
    {
        $texto = number_format((float) $valor, 6, '.', $miles ? ',' : '');
        $texto = rtrim($texto, '0');
        // Al menos 2 decimales.
        $decimales = strlen(substr($texto, (int) strpos($texto, '.') + 1));

        return $decimales >= 2 ? $texto : $texto.str_repeat('0', 2 - $decimales);
    }
}
