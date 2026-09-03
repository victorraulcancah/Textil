<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Los motivos de la guía de traslado pasan de una lista fija a un catálogo
 * administrable. Se siembran los de la guía de remisión; los del sistema no se
 * pueden borrar porque el resto de la app los referencia por código.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('motivos_traslado', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 50)->unique();
            $table->string('nombre');
            $table->boolean('es_sistema')->default(false);
            $table->boolean('activo')->default(true);
            $table->timestamps();
        });

        $ahora = now();
        DB::table('motivos_traslado')->insert([
            ['codigo' => 'traslado_entre_establecimientos', 'nombre' => 'Traslado entre establecimientos de la misma empresa', 'es_sistema' => true, 'activo' => true, 'created_at' => $ahora, 'updated_at' => $ahora],
            ['codigo' => 'venta', 'nombre' => 'Venta', 'es_sistema' => false, 'activo' => true, 'created_at' => $ahora, 'updated_at' => $ahora],
            ['codigo' => 'compra', 'nombre' => 'Compra', 'es_sistema' => false, 'activo' => true, 'created_at' => $ahora, 'updated_at' => $ahora],
            ['codigo' => 'devolucion', 'nombre' => 'Devolución', 'es_sistema' => false, 'activo' => true, 'created_at' => $ahora, 'updated_at' => $ahora],
            ['codigo' => 'consignacion', 'nombre' => 'Consignación', 'es_sistema' => false, 'activo' => true, 'created_at' => $ahora, 'updated_at' => $ahora],
            ['codigo' => 'traslado_zona_primaria', 'nombre' => 'Traslado a zona primaria', 'es_sistema' => false, 'activo' => true, 'created_at' => $ahora, 'updated_at' => $ahora],
            ['codigo' => 'otros', 'nombre' => 'Otros', 'es_sistema' => false, 'activo' => true, 'created_at' => $ahora, 'updated_at' => $ahora],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('motivos_traslado');
    }
};
