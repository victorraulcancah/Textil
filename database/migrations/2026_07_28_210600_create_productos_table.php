<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('productos', function (Blueprint $table) {
            $table->id();
            $table->string('codigo')->unique();
            $table->string('nombre');
            $table->foreignId('marca_id')->constrained('marcas');
            $table->foreignId('sub_marca_id')->nullable()->constrained('sub_marcas');
            $table->foreignId('categoria_id')->nullable()->constrained('categorias');
            $table->foreignId('unidad_medida_id')->constrained('unidades_medida');
            $table->text('descripcion')->nullable();
            $table->decimal('precio_base', 12, 2)->default(0);
            $table->boolean('afecto_igv')->default(true);
            $table->boolean('activo')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('productos');
    }
};
