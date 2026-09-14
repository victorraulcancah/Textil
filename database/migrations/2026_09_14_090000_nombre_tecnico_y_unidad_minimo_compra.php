<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dos aclaraciones que pidió el cliente sobre la ficha técnica de la tela:
 *
 *   - El nombre con el que la fábrica la identifica puede ser distinto del
 *     nombre con el que se vende (`nombre`, ya existente). Antes solo había
 *     uno; ahora el técnico es un dato aparte y opcional.
 *   - El "Mínimo de compra" no decía si la cantidad era en metros o en
 *     rollos. Se guarda la unidad junto al número.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('productos', 'nombre_tecnico')) {
            Schema::table('productos', function (Blueprint $table) {
                $table->string('nombre_tecnico')->nullable()->after('nombre');
                $table->string('unidad_minimo_compra', 10)->nullable()->after('minimo_compra');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('productos', 'nombre_tecnico')) {
            Schema::table('productos', function (Blueprint $table) {
                $table->dropColumn(['nombre_tecnico', 'unidad_minimo_compra']);
            });
        }
    }
};
