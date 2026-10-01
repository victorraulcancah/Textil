<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Una letra de cambio se cobra desde su propia pantalla: queda "pagada" con la
 * fecha en que se cobró. El cobro se registra como un pago de la cuenta por
 * cobrar de la que salió (con su movimiento de caja).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            $table->date('fecha_pago')->nullable()->after('estado');
        });
    }

    public function down(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            $table->dropColumn('fecha_pago');
        });
    }
};
