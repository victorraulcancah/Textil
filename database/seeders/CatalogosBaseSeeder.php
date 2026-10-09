<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Los catálogos que el sistema necesita para funcionar, sin datos de prueba.
 *
 * Una sola lista para los dos momentos en que hacen falta: al instalar
 * (ProductionSeeder) y al limpiar los datos (php artisan datos:limpiar), que
 * los vacía y los vuelve a sembrar limpios. Idempotente.
 */
class CatalogosBaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            UnidadesMedidaSeeder::class,
            MetodosPagoSeeder::class,
            MotivosMovimientoSeeder::class,
            MotivosTrasladoSeeder::class,
            TiposPrecioSeeder::class,
            ConceptosYContenedoresSeeder::class,
            AlmacenPrincipalSeeder::class,
        ]);
    }
}
