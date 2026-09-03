<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Costeo (PEPS/UEPS/Promedio Ponderado) se retira: la tienda de abarrotes
 * no lo necesita y la configuración no alimentaba ningún cálculo real de stock.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('costeo_configs');
    }

    public function down(): void
    {
        Schema::create('costeo_configs', function (Blueprint $table) {
            $table->id();
            $table->string('metodo');
            $table->timestamps();
        });
    }
};
