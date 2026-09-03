<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Una caja acepta: efectivo (opcional) + cuentas bancarias específicas (transferencias)
 * + billeteras digitales específicas. Reemplaza el uso de caja_metodo_pago.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cajas', function (Blueprint $table) {
            if (! Schema::hasColumn('cajas', 'acepta_efectivo')) {
                $table->boolean('acepta_efectivo')->default(true)->after('nombre');
            }
        });

        Schema::create('caja_cuenta_bancaria', function (Blueprint $table) {
            $table->id();
            $table->foreignId('caja_id')->constrained('cajas')->cascadeOnDelete();
            $table->foreignId('cuenta_bancaria_id')->constrained('cuentas_bancarias')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['caja_id', 'cuenta_bancaria_id']);
        });

        Schema::create('caja_billetera', function (Blueprint $table) {
            $table->id();
            $table->foreignId('caja_id')->constrained('cajas')->cascadeOnDelete();
            $table->foreignId('billetera_id')->constrained('billeteras_digitales')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['caja_id', 'billetera_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('caja_billetera');
        Schema::dropIfExists('caja_cuenta_bancaria');
        Schema::table('cajas', function (Blueprint $table) {
            $table->dropColumn('acepta_efectivo');
        });
    }
};
