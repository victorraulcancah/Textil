<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ajustes_inventario', function (Blueprint $table) {
            $table->id();
            $table->foreignId('almacen_id')->constrained('almacenes');
            $table->string('tipo');
            $table->string('motivo');
            $table->string('estado')->default('pendiente');
            $table->foreignId('usuario_solicita_id')->constrained('users');
            $table->foreignId('usuario_aprueba_id')->nullable()->constrained('users');
            $table->timestamp('fecha');
            $table->text('observaciones')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ajustes_inventario');
    }
};
