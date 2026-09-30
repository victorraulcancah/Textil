<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Los tipos de contenedor de la orden de compra al exterior (TIPO / TAMAÑO):
 * 20 GP, 40 NOR, 40 HC… Se administran desde el propio formulario.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tipos_contenedor', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 50)->unique();
            $table->boolean('activo')->default(true);
            $table->timestamps();
        });

        foreach (['20 GP', '40 NOR', '40 HC'] as $nombre) {
            DB::table('tipos_contenedor')->insert(['nombre' => $nombre, 'activo' => true, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tipos_contenedor');
    }
};
