<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marca el almacén con el que se trabaja a diario. Las pantallas que piden un
 * almacén (nota de venta, por ejemplo) arrancan con este ya elegido, para no
 * seleccionarlo a mano en cada documento.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('almacenes', 'predeterminado')) {
            return;
        }

        Schema::table('almacenes', function (Blueprint $table) {
            $table->boolean('predeterminado')->default(false)->after('activo');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('almacenes', 'predeterminado')) {
            return;
        }

        Schema::table('almacenes', function (Blueprint $table) {
            $table->dropColumn('predeterminado');
        });
    }
};
