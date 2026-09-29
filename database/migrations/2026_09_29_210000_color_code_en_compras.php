<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Color code": el código del color que cada persona escribe en su orden de
 * compra o compra (el del proveedor, el del envío…). Es texto libre, distinto
 * del código del color en el catálogo.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['orden_compra_detalles', 'compra_detalles'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->string('color_code', 50)->nullable()->after('producto_color_id');
            });
        }
    }

    public function down(): void
    {
        foreach (['orden_compra_detalles', 'compra_detalles'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->dropColumn('color_code');
            });
        }
    }
};
