<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('producto_variante_atributo_valor', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_variante_id')->constrained('producto_variantes')->cascadeOnDelete();
            $table->foreignId('atributo_valor_id')->constrained('atributo_valores')->cascadeOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('producto_variante_atributo_valor');
    }
};
