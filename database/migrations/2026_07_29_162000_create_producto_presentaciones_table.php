<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('producto_presentaciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            $table->string('nombre');
            $table->string('codigo_barras')->nullable();
            $table->decimal('precio_venta', 12, 2)->default(0);
            $table->decimal('factor_conversion', 12, 2)->default(1);
            $table->foreignId('unidad_base_id')->nullable()->constrained('unidades_medida')->nullOnDelete();
            $table->boolean('activo')->default(true);
            $table->timestamps();

            $table->unique(['producto_id', 'nombre']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('producto_presentaciones');
    }
};
