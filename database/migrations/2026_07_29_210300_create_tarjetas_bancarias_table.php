<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tarjetas_bancarias', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cuenta_bancaria_id')->constrained('cuentas_bancarias');
            $table->string('tipo_tarjeta', 20);
            $table->string('nombre_referencial');
            $table->string('numero_enmascarado', 20);
            $table->string('marca', 30);
            $table->string('fecha_vencimiento', 10)->nullable();
            $table->string('titular')->nullable();
            $table->decimal('limite_credito', 12, 2)->nullable();
            $table->string('estado', 20)->default('activa');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tarjetas_bancarias');
    }
};
