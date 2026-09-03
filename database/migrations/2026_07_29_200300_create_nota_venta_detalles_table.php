<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('nota_venta_detalles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('nota_venta_id')->constrained('notas_venta')->cascadeOnDelete();
            $table->foreignId('producto_presentacion_id')->constrained('producto_presentaciones');
            $table->decimal('cantidad', 12, 2);
            $table->decimal('precio_unitario', 12, 2);
            $table->decimal('descuento', 12, 2)->default(0);
            $table->decimal('subtotal', 12, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('nota_venta_detalles');
    }
};
