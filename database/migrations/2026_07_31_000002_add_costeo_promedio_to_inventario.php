<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Costeo por promedio ponderado para el Kardex valorizado:
 * - producto_almacen_stock.costo_promedio: costo promedio actual del producto en ese almacén.
 * - movimientos_inventario.costo_anterior / costo_actual: promedio antes y después del movimiento.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->decimal('costo_promedio', 12, 4)->default(0)->after('stock_disponible');
        });

        Schema::table('movimientos_inventario', function (Blueprint $table) {
            $table->decimal('costo_anterior', 12, 4)->default(0)->after('costo_unitario');
            $table->decimal('costo_actual', 12, 4)->default(0)->after('costo_anterior');
        });
    }

    public function down(): void
    {
        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->dropColumn('costo_promedio');
        });
        Schema::table('movimientos_inventario', function (Blueprint $table) {
            $table->dropColumn(['costo_anterior', 'costo_actual']);
        });
    }
};
