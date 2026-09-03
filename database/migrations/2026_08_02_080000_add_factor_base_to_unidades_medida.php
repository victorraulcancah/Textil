<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * factor_base = cuántas unidades mínimas de su familia equivale la unidad
 * (g=1, kg=1000, ml=1, l=1000, unidad=1, docena=12...). Sirve para derivar
 * el factor de conversión de una presentación al elegir su unidad de una lista.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('unidades_medida', function (Blueprint $table) {
            if (! Schema::hasColumn('unidades_medida', 'factor_base')) {
                $table->decimal('factor_base', 14, 4)->default(1)->after('abreviatura');
            }
        });
    }

    public function down(): void
    {
        Schema::table('unidades_medida', function (Blueprint $table) {
            $table->dropColumn('factor_base');
        });
    }
};
