<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producto_variantes', function (Blueprint $table) {
            $table->decimal('stock', 12, 2)->default(0)->change();
        });

        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->decimal('stock_actual', 12, 2)->default(0)->change();
            $table->decimal('stock_reservado', 12, 2)->default(0)->change();
            $table->decimal('stock_disponible', 12, 2)->default(0)->change();
            $table->decimal('stock_minimo', 12, 2)->default(0)->change();
            $table->decimal('stock_maximo', 12, 2)->default(0)->change();
        });
    }

    public function down(): void
    {
        Schema::table('producto_variantes', function (Blueprint $table) {
            $table->integer('stock')->default(0)->change();
        });

        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->integer('stock_actual')->default(0)->change();
            $table->integer('stock_reservado')->default(0)->change();
            $table->integer('stock_disponible')->default(0)->change();
            $table->integer('stock_minimo')->default(0)->change();
            $table->integer('stock_maximo')->default(0)->change();
        });
    }
};
