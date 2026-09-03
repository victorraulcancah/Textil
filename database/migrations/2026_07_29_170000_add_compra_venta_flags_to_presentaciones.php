<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producto_presentaciones', function (Blueprint $table) {
            $table->boolean('es_compra')->default(true)->after('factor_conversion');
            $table->boolean('es_venta')->default(true)->after('es_compra');
        });
    }

    public function down(): void
    {
        Schema::table('producto_presentaciones', function (Blueprint $table) {
            $table->dropColumn(['es_compra', 'es_venta']);
        });
    }
};
