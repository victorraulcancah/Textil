<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('toma_inventario_detalles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('toma_id')->constrained('tomas_inventario')->cascadeOnDelete();
            $table->foreignId('producto_id')->nullable()->constrained('productos')->cascadeOnDelete();
            $table->foreignId('producto_variante_id')->nullable()->constrained('producto_variantes')->cascadeOnDelete();
            $table->decimal('stock_sistema', 12, 2)->default(0);
            $table->decimal('stock_contado', 12, 2)->default(0);
            $table->decimal('diferencia', 12, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('toma_inventario_detalles');
    }
};
