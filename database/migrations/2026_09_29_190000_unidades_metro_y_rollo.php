<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Una tela se vende por metro y se compra por rollo: sin la unidad Metro (m) el
 * formulario de producto no arma la tabla de colores, y sin Rollo no hay cómo
 * comprarla. Ningún seeder las crea, así que un servidor nuevo no las tenía.
 *
 * Solo agrega las que faltan: si ya existe una con esa abreviatura o ese
 * nombre, no la toca.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach ([['m', 'Metro'], ['RLL', 'Rollo']] as [$abreviatura, $nombre]) {
            $existe = DB::table('unidades_medida')
                ->whereRaw('LOWER(abreviatura) = ?', [strtolower($abreviatura)])
                ->orWhereRaw('LOWER(nombre) = ?', [strtolower($nombre)])
                ->exists();

            if (! $existe) {
                DB::table('unidades_medida')->insert([
                    'nombre' => $nombre,
                    'abreviatura' => $abreviatura,
                    'factor_base' => 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        // No se revierte: pueden tener productos.
    }
};
