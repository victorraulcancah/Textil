<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La estructura física de un almacén: piso → pasillo → rack → nivel →
 * posición. No todos los almacenes llegan a los 5 niveles —uno chico puede
 * quedarse en pasillo—, así que en vez de una tabla por nivel se usa una
 * sola tabla que se referencia a sí misma: cada fila es una ubicación, con
 * un padre opcional que es la ubicación de arriba.
 *
 * Los rollos existentes no se tocan: su `pasillo`/`rack`/`nivel`/`posicion`
 * en texto libre se queda igual. Los nuevos pueden apuntar a una ubicación
 * de este árbol en vez de repetir el texto a mano.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('almacen_ubicaciones')) {
            Schema::create('almacen_ubicaciones', function (Blueprint $table) {
                $table->id();
                $table->foreignId('almacen_id')->constrained('almacenes')->cascadeOnDelete();
                // Null = es un piso, la raíz del árbol de ese almacén.
                $table->foreignId('padre_id')->nullable()->constrained('almacen_ubicaciones')->cascadeOnDelete();
                $table->enum('tipo', ['piso', 'pasillo', 'rack', 'nivel', 'posicion']);
                $table->string('nombre', 60);
                $table->unsignedSmallInteger('orden')->default(0);
                $table->boolean('activo')->default(true);
                $table->timestamps();

                $table->index(['almacen_id', 'padre_id']);
            });
        }

        if (! Schema::hasColumn('rollos', 'almacen_ubicacion_id')) {
            Schema::table('rollos', function (Blueprint $table) {
                $table->foreignId('almacen_ubicacion_id')
                    ->nullable()
                    ->after('posicion')
                    ->constrained('almacen_ubicaciones')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('rollos', 'almacen_ubicacion_id')) {
            Schema::table('rollos', function (Blueprint $table) {
                $table->dropConstrainedForeignId('almacen_ubicacion_id');
            });
        }

        Schema::dropIfExists('almacen_ubicaciones');
    }
};
