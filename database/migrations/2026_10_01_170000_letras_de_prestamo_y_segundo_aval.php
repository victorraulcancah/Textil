<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Letras que no salen de una cuenta por cobrar (por ejemplo, de préstamos) llevan un concepto
 * propio; y la letra tiene dos avales permanentes, como el formulario impreso.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            // "Préstamo", por ejemplo; las letras de una venta no lo llevan (su concepto es el canje de la proforma).
            $table->string('concepto', 80)->nullable()->after('referencia');

            // El segundo aval permanente.
            $table->string('aval2_nombre', 255)->nullable()->after('aval_localidad');
            $table->string('aval2_documento', 20)->nullable()->after('aval2_nombre');
            $table->string('aval2_domicilio', 255)->nullable()->after('aval2_documento');
            $table->string('aval2_localidad', 120)->nullable()->after('aval2_domicilio');
        });
    }

    public function down(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            $table->dropColumn(['concepto', 'aval2_nombre', 'aval2_documento', 'aval2_domicilio', 'aval2_localidad']);
        });
    }
};
