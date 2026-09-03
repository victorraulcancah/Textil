<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El stock y el Kardex viven por PRODUCTO en unidad base (no por presentación).
 * Las compras/ventas se hacen por presentación (esas tablas quedan igual),
 * pero el almacén guarda un solo pozo de stock por producto.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->dropForeign(['producto_presentacion_id']);
        });
        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->dropUnique('prod_alm_stock_unique');
        });
        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->dropColumn('producto_presentacion_id');
        });
        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->foreignId('producto_id')
                ->nullable()
                ->after('id')
                ->constrained('productos')
                ->cascadeOnDelete();
            $table->unique(['producto_id', 'almacen_id'], 'prod_alm_stock_unique');
        });

        Schema::table('movimientos_inventario', function (Blueprint $table) {
            $table->dropConstrainedForeignId('producto_presentacion_id');
        });
        Schema::table('movimientos_inventario', function (Blueprint $table) {
            $table->foreignId('producto_id')
                ->nullable()
                ->after('id')
                ->constrained('productos')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->dropUnique('prod_alm_stock_unique');
        });
        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->dropConstrainedForeignId('producto_id');
        });
        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->foreignId('producto_presentacion_id')
                ->nullable()
                ->after('id')
                ->constrained('producto_presentaciones')
                ->cascadeOnDelete();
            $table->unique(['producto_presentacion_id', 'almacen_id'], 'prod_alm_stock_unique');
        });

        Schema::table('movimientos_inventario', function (Blueprint $table) {
            $table->dropConstrainedForeignId('producto_id');
        });
        Schema::table('movimientos_inventario', function (Blueprint $table) {
            $table->foreignId('producto_presentacion_id')
                ->nullable()
                ->after('id')
                ->constrained('producto_presentaciones')
                ->cascadeOnDelete();
        });
    }
};
