<?php

namespace Database\Seeders;

use App\Models\TipoPrecio;
use Illuminate\Database\Seeder;

/**
 * El tipo de precio principal: el precio de siempre, el que usan los clientes
 * sin tipo asignado. Solo se crea si no hay uno (se respeta si lo renombraron).
 */
class TiposPrecioSeeder extends Seeder
{
    public function run(): void
    {
        if (TipoPrecio::where('principal', true)->exists()) {
            return;
        }

        TipoPrecio::firstOrCreate(
            ['nombre' => 'Minorista'],
            ['margen' => 25, 'orden' => 1, 'activo' => true],
        )->update(['principal' => true, 'activo' => true]);
    }
}
