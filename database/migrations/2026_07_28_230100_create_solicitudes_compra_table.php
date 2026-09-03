<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('solicitudes_compra', function (Blueprint $table) {
            $table->id();
            $table->string('codigo')->unique();
            $table->timestamp('fecha_solicitud');
            $table->foreignId('usuario_solicita_id')->constrained('users');
            $table->foreignId('usuario_aprueba_id')->nullable()->constrained('users');
            $table->string('estado')->default('pendiente');
            $table->text('observaciones')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('solicitudes_compra');
    }
};
