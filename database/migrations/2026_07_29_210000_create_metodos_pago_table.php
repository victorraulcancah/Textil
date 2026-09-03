<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metodos_pago', function (Blueprint $table) {
            $table->id();
            $table->string('nombre');
            $table->string('tipo', 30);
            $table->boolean('es_sistema')->default(false);
            $table->boolean('requiere_cuenta_bancaria')->default(false);
            $table->boolean('requiere_tarjeta')->default(false);
            $table->boolean('requiere_numero_operacion')->default(false);
            $table->boolean('requiere_captura')->default(false);
            $table->boolean('activo')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metodos_pago');
    }
};
