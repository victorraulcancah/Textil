<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('nota_venta_pagos', function (Blueprint $table) {
            $table->foreignId('metodo_pago_id')->nullable()->after('nota_venta_id')->constrained('metodos_pago')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('nota_venta_pagos', function (Blueprint $table) {
            $table->dropForeign(['metodo_pago_id']);
            $table->dropColumn('metodo_pago_id');
        });
    }
};
