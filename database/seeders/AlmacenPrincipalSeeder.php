<?php

namespace Database\Seeders;

use App\Models\Almacen;
use Illuminate\Database\Seeder;

/**
 * El almacén con el que arranca el sistema: sin ninguno no se puede vender,
 * recibir ni mover stock. Solo se crea si no hay ningún almacén (si ya hay,
 * aunque estén inactivos, se respeta lo que se configuró). Idempotente.
 */
class AlmacenPrincipalSeeder extends Seeder
{
    public function run(): void
    {
        if (Almacen::query()->exists()) {
            return;
        }

        Almacen::create([
            'nombre' => 'ALMACÉN PRINCIPAL',
            'codigo' => 'ALM-01',
            'tipo' => 'principal',
            'activo' => true,
            'predeterminado' => true,
        ]);
    }
}
