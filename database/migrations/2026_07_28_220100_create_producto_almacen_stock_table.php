<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('producto_almacen_stock', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->nullable()->constrained('productos')->cascadeOnDelete();
            $table->foreignId('producto_variante_id')->nullable()->constrained('producto_variantes')->cascadeOnDelete();
            $table->foreignId('almacen_id')->constrained('almacenes')->cascadeOnDelete();
            $table->integer('stock_actual')->default(0);
            $table->integer('stock_reservado')->default(0);
            $table->integer('stock_disponible')->default(0);
            $table->integer('stock_minimo')->default(0);
            $table->integer('stock_maximo')->default(0);
            $table->string('ubicacion')->nullable();
            $table->timestamps();

            $table->unique(['producto_id', 'producto_variante_id', 'almacen_id'], 'prod_alm_stock_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('producto_almacen_stock');
    }
};
