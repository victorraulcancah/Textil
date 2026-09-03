<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recepcion_compra_detalles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('recepcion_id')->constrained('recepciones_compra')->cascadeOnDelete();
            $table->unsignedBigInteger('orden_compra_detalle_id')->nullable();
            $table->foreignId('producto_id')->nullable()->constrained('productos')->cascadeOnDelete();
            $table->foreignId('producto_variante_id')->nullable()->constrained('producto_variantes')->cascadeOnDelete();
            $table->decimal('cantidad_ordenada', 12, 2)->default(0);
            $table->decimal('cantidad_recibida', 12, 2)->default(0);
            $table->decimal('cantidad_conforme', 12, 2)->default(0);
            $table->decimal('cantidad_rechazada', 12, 2)->default(0);
            $table->decimal('costo_unitario', 12, 2)->default(0);
            $table->string('lote')->nullable();
            $table->timestamp('fecha_vencimiento')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recepcion_compra_detalles');
    }
};
