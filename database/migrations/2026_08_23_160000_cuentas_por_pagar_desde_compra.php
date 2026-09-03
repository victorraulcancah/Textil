<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Una cuenta por pagar nacía solo de una recepción de compra, y por eso una
 * compra al crédito no generaba deuda: el flujo real registra la compra
 * directamente. Se permite que cuelgue de cualquiera de las dos.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cuentas_por_pagar', function (Blueprint $table) {
            $table->foreignId('recepcion_compra_id')->nullable()->change();

            if (! Schema::hasColumn('cuentas_por_pagar', 'compra_id')) {
                $table->foreignId('compra_id')
                    ->nullable()
                    ->after('recepcion_compra_id')
                    ->constrained('compras')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('cuentas_por_pagar', function (Blueprint $table) {
            if (Schema::hasColumn('cuentas_por_pagar', 'compra_id')) {
                $table->dropConstrainedForeignId('compra_id');
            }
            $table->foreignId('recepcion_compra_id')->nullable(false)->change();
        });
    }
};
