<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Los conceptos de los gastos adicionales de una compra (seguro, agente de
 * aduana, transporte local…): un catálogo que se administra desde el propio
 * formulario. El gasto guarda el nombre, no el id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conceptos_gasto', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 100)->unique();
            $table->boolean('activo')->default(true);
            $table->timestamps();
        });

        foreach (['SEGURO', 'AGENTE DE ADUANA', 'DERECHOS DE ADUANA', 'TRANSPORTE LOCAL', 'DESCARGA Y ALMACENAJE', 'COMISIÓN BANCARIA', 'OTROS'] as $nombre) {
            DB::table('conceptos_gasto')->insert(['nombre' => $nombre, 'activo' => true, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('conceptos_gasto');
    }
};
