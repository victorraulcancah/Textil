<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cada gasto de la compra lleva el día en que se pagó, el tipo de cambio de
 * ese día y lo que fue en soles: así se sabe con qué valor entró al costo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('compra_gastos', function (Blueprint $table) {
            $table->date('fecha')->nullable()->after('concepto');
            $table->decimal('tipo_cambio', 10, 4)->nullable()->after('moneda');
            $table->decimal('monto_pen', 14, 2)->nullable()->after('tipo_cambio');
        });
    }

    public function down(): void
    {
        Schema::table('compra_gastos', function (Blueprint $table) {
            $table->dropColumn(['fecha', 'tipo_cambio', 'monto_pen']);
        });
    }
};
