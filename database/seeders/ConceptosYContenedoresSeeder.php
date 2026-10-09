<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Los conceptos de gasto de una compra y los tipos de contenedor con que arranca
 * el sistema. Antes los sembraba solo la migración, así que al limpiar los datos
 * no volvían. Idempotente: no pisa lo que ya exista.
 */
class ConceptosYContenedoresSeeder extends Seeder
{
    public function run(): void
    {
        $this->sembrar('conceptos_gasto', [
            'SEGURO', 'AGENTE DE ADUANA', 'DERECHOS DE ADUANA', 'TRANSPORTE LOCAL',
            'DESCARGA Y ALMACENAJE', 'COMISIÓN BANCARIA', 'OTROS',
        ]);

        $this->sembrar('tipos_contenedor', ['20 GP', '40 NOR', '40 HC']);
    }

    private function sembrar(string $tabla, array $nombres): void
    {
        foreach ($nombres as $nombre) {
            DB::table($tabla)->updateOrInsert(
                ['nombre' => $nombre],
                ['activo' => true, 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }
}
