<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La moneda del dinero que de verdad se movió, en toda la cadena de una
 * compra al exterior: la deuda que deja (`cuentas_por_pagar`), lo que se
 * pagó al registrarla (`compra_pagos`), las cuotas que se le van abonando
 * (`cuentas_por_pagar_pagos`) y el egreso de caja que cada cuota genera
 * (`movimientos_caja`).
 *
 * No hay conversión aquí: si la deuda es en dólares, se paga en dólares —
 * es plata real que salió así. Solo se etiqueta, que es lo que faltaba: todo
 * esto se guardaba como si siempre fuera soles.
 */
return new class extends Migration
{
    public function up(): void
    {
        $despuesDe = [
            'compra_pagos' => 'monto',
            'cuentas_por_pagar' => 'monto_total',
            'cuentas_por_pagar_pagos' => 'monto',
            'movimientos_caja' => 'monto',
        ];

        foreach ($despuesDe as $tabla => $columna) {
            if (! Schema::hasColumn($tabla, 'moneda')) {
                Schema::table($tabla, function (Blueprint $table) use ($columna) {
                    $table->string('moneda', 10)->default('PEN')->after($columna);
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['compra_pagos', 'cuentas_por_pagar', 'cuentas_por_pagar_pagos', 'movimientos_caja'] as $tabla) {
            if (Schema::hasColumn($tabla, 'moneda')) {
                Schema::table($tabla, function (Blueprint $table) {
                    $table->dropColumn('moneda');
                });
            }
        }
    }
};
