<?php

namespace Database\Seeders;

use App\Models\MotivoTraslado;
use Illuminate\Database\Seeder;

/**
 * Los motivos de traslado con los que nace el sistema (los de la guía de
 * remisión). Los mismos que siembra la migración que crea la tabla.
 *
 * Solo crea los que falten: si alguien renombró o desactivó uno, se respeta.
 */
class MotivosTrasladoSeeder extends Seeder
{
    private const MOTIVOS = [
        // [codigo, nombre, es_sistema]
        ['traslado_entre_establecimientos', 'Traslado entre establecimientos de la misma empresa', true],
        ['venta', 'Venta', false],
        ['compra', 'Compra', false],
        ['devolucion', 'Devolución', false],
        ['consignacion', 'Consignación', false],
        ['traslado_zona_primaria', 'Traslado a zona primaria', false],
        ['otros', 'Otros', false],
    ];

    public function run(): void
    {
        foreach (self::MOTIVOS as [$codigo, $nombre, $esSistema]) {
            MotivoTraslado::firstOrCreate(
                ['codigo' => $codigo],
                ['nombre' => $nombre, 'es_sistema' => $esSistema, 'activo' => true],
            );
        }
    }
}
