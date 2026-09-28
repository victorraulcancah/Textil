<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Una compra (o su cuenta por pagar) en dólares se puede pagar con soles.
 *
 * `monto` sigue siendo lo que el pago abona a la deuda, en la moneda de la
 * deuda: todo lo que suma pagos (saldo, lo pagado) no cambia. Cuando el pago
 * salió en soles se guarda además cuánto salió (`monto_pen`) y a qué tipo de
 * cambio, que se pone a mano: `monto = monto_pen / tipo_cambio`.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['compra_pagos', 'cuentas_por_pagar_pagos'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->decimal('monto_pen', 12, 2)->nullable()->after('moneda');
                $table->decimal('tipo_cambio', 12, 4)->nullable()->after('monto_pen');
            });
        }
    }

    public function down(): void
    {
        foreach (['compra_pagos', 'cuentas_por_pagar_pagos'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->dropColumn(['monto_pen', 'tipo_cambio']);
            });
        }
    }
};
