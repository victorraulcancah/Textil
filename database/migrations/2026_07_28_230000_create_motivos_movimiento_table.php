<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('motivos_movimiento', function (Blueprint $table) {
            $table->id();
            $table->string('nombre');
            $table->string('tipo'); // entrada | salida
            $table->boolean('es_sistema')->default(false);
            $table->boolean('activo')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('motivos_movimiento');
    }
};
