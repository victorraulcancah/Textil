<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Convierte el préstamo en un documento formal numerado (PR01-0001) con
 * datos de identificación del tercero.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prestamos', function (Blueprint $table) {
            $table->string('serie', 10)->nullable()->after('id');
            $table->string('numero', 12)->nullable()->after('serie');
            // Identificación y contacto de con quién se hace el préstamo.
            $table->string('tercero_documento', 15)->nullable()->after('tercero');
            $table->string('tercero_telefono', 20)->nullable()->after('tercero_documento');
            // Fecha real en que quedó devuelto por completo (el modelo ya la usaba, pero no existía).
            $table->dateTime('fecha_devolucion')->nullable()->after('fecha_devolucion_esperada');
            $table->unique(['serie', 'numero'], 'prestamos_serie_numero_unique');
        });
    }

    public function down(): void
    {
        Schema::table('prestamos', function (Blueprint $table) {
            $table->dropUnique('prestamos_serie_numero_unique');
            $table->dropColumn(['serie', 'numero', 'tercero_documento', 'tercero_telefono', 'fecha_devolucion']);
        });
    }
};
