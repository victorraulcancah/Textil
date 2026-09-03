<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * En los ajustes solo se registran ingresos/salidas con una cantidad por línea
 * (no un "stock real"). Guardamos esa cantidad en `cantidad`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ajuste_detalles', function (Blueprint $table) {
            $table->decimal('cantidad', 12, 2)->default(0)->after('producto_presentacion_id');
        });
    }

    public function down(): void
    {
        Schema::table('ajuste_detalles', function (Blueprint $table) {
            $table->dropColumn('cantidad');
        });
    }
};
