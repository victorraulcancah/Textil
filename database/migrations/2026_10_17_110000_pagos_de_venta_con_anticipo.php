<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pagar una venta con un anticipo del cliente: el pago de la venta apunta al anticipo que se usó. Ese dinero ya entró a
 * la caja cuando el cliente lo entregó, así que este pago no genera otro ingreso.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('nota_venta_pagos', function (Blueprint $table) {
            $table->foreignId('anticipo_id')->nullable()->after('billetera_id')->constrained('anticipos')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('nota_venta_pagos', function (Blueprint $table) {
            $table->dropConstrainedForeignId('anticipo_id');
        });
    }
};
