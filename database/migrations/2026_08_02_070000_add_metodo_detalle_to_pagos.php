<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Unifica el método de pago en todos los pagos: además del tipo (forma/metodo),
 * guarda la cuenta bancaria o billetera específica (transferencia/billetera).
 */
return new class extends Migration
{
    private array $tablas = [
        'cuentas_por_cobrar_pagos',
        'cuentas_por_pagar_pagos',
        'compra_pagos',
        'nota_venta_pagos',
    ];

    public function up(): void
    {
        foreach ($this->tablas as $tabla) {
            Schema::table($tabla, function (Blueprint $table) use ($tabla) {
                if (! Schema::hasColumn($tabla, 'cuenta_bancaria_id')) {
                    $table->foreignId('cuenta_bancaria_id')->nullable()->constrained('cuentas_bancarias')->nullOnDelete();
                }
                if (! Schema::hasColumn($tabla, 'billetera_id')) {
                    $table->foreignId('billetera_id')->nullable()->constrained('billeteras_digitales')->nullOnDelete();
                }
            });
        }
    }

    public function down(): void
    {
        foreach ($this->tablas as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->dropConstrainedForeignId('cuenta_bancaria_id');
                $table->dropConstrainedForeignId('billetera_id');
            });
        }
    }
};
