<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La glosa de un abono (por ejemplo "CANC D: PF002-001, CLIENTE…"): el texto que explica a qué documento se aplicó el
 * pago. También es la descripción del movimiento de caja.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['cuentas_por_cobrar_pagos', 'cuentas_por_pagar_pagos'] as $tabla) {
            if (! Schema::hasColumn($tabla, 'glosa')) {
                Schema::table($tabla, function (Blueprint $table) {
                    $table->string('glosa', 255)->nullable()->after('referencia');
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['cuentas_por_cobrar_pagos', 'cuentas_por_pagar_pagos'] as $tabla) {
            if (Schema::hasColumn($tabla, 'glosa')) {
                Schema::table($tabla, fn (Blueprint $table) => $table->dropColumn('glosa'));
            }
        }
    }
};
