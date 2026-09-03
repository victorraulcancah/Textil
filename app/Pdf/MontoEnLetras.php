<?php

namespace App\Pdf;

/**
 * Convierte un monto a su representación en letras en español
 * (para el "Son: … soles" de los comprobantes).
 */
class MontoEnLetras
{
    private const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    private const ESPECIALES = [
        10 => 'DIEZ', 11 => 'ONCE', 12 => 'DOCE', 13 => 'TRECE', 14 => 'CATORCE', 15 => 'QUINCE',
        16 => 'DIECISÉIS', 17 => 'DIECISIETE', 18 => 'DIECIOCHO', 19 => 'DIECINUEVE', 20 => 'VEINTE',
    ];
    private const DECENAS = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    private const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    public static function convertir(float $monto, string $moneda = 'SOLES'): string
    {
        $entero = (int) floor($monto);
        $centavos = (int) round(($monto - $entero) * 100);
        $letras = $entero === 0 ? 'CERO' : self::miles($entero);

        return trim($letras) . ' CON ' . str_pad((string) $centavos, 2, '0', STR_PAD_LEFT) . '/100 ' . $moneda;
    }

    private static function miles(int $n): string
    {
        if ($n < 1000) {
            return self::centenas($n);
        }
        if ($n < 1000000) {
            $miles = intdiv($n, 1000);
            $resto = $n % 1000;
            $prefijo = $miles === 1 ? 'MIL' : self::centenas($miles) . ' MIL';

            return trim($prefijo . ' ' . self::centenas($resto));
        }
        $millones = intdiv($n, 1000000);
        $resto = $n % 1000000;
        $prefijo = $millones === 1 ? 'UN MILLÓN' : self::centenas($millones) . ' MILLONES';

        return trim($prefijo . ' ' . self::miles($resto));
    }

    private static function centenas(int $n): string
    {
        if ($n === 0) {
            return '';
        }
        if ($n === 100) {
            return 'CIEN';
        }
        $centena = intdiv($n, 100);
        $resto = $n % 100;

        return trim(self::CENTENAS[$centena] . ' ' . self::decenas($resto));
    }

    private static function decenas(int $n): string
    {
        if ($n === 0) {
            return '';
        }
        if ($n < 10) {
            return self::UNIDADES[$n];
        }
        if (isset(self::ESPECIALES[$n])) {
            return self::ESPECIALES[$n];
        }
        $decena = intdiv($n, 10);
        $unidad = $n % 10;
        if ($decena === 2) {
            // VEINTIUNO, VEINTIDÓS…
            return 'VEINTI' . mb_strtolower(self::UNIDADES[$unidad]);
        }

        return self::DECENAS[$decena] . ($unidad ? ' Y ' . self::UNIDADES[$unidad] : '');
    }
}
