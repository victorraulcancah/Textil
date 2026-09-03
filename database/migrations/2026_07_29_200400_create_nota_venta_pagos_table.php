<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('nota_venta_pagos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('nota_venta_id')->constrained('notas_venta')->cascadeOnDelete();
            $table->string('forma_pago', 30);
            $table->decimal('monto', 12, 2);
            $table->date('fecha');
            $table->string('referencia', 100)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('nota_venta_pagos');
    }
};
