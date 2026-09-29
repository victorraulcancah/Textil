<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Vender en dólares y a crédito por cuotas.
 *
 *  - notas_venta / ordenes_venta: el tipo de cambio SUNAT (venta) del día,
 *    para llevar a soles una venta en dólares en los reportes.
 *  - nota_venta_pagos / cuentas_por_cobrar_pagos: como en compras, `monto` es
 *    lo que abona en la moneda del documento; si el cliente pagó con soles se
 *    guarda cuánto (`monto_pen`) y a qué tipo de cambio.
 *  - cuentas_por_cobrar: la moneda de la deuda, y cada cuota es su propia
 *    cuenta (`numero_cuota` de `total_cuotas`), con su vencimiento.
 *  - cierres_caja: el arqueo de los dólares, aparte de los soles.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['notas_venta', 'ordenes_venta'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->decimal('tipo_cambio', 12, 4)->nullable()->after('moneda');
            });
        }

        foreach (['nota_venta_pagos', 'cuentas_por_cobrar_pagos'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->string('moneda', 10)->default('PEN')->after('monto');
                $table->decimal('monto_pen', 12, 2)->nullable()->after('moneda');
                $table->decimal('tipo_cambio', 12, 4)->nullable()->after('monto_pen');
            });
        }

        Schema::table('cuentas_por_cobrar', function (Blueprint $table) {
            $table->unsignedSmallInteger('numero_cuota')->default(1)->after('cliente_id');
            $table->unsignedSmallInteger('total_cuotas')->default(1)->after('numero_cuota');
            $table->string('moneda', 10)->default('PEN')->after('monto_total');
        });

        Schema::table('cierres_caja', function (Blueprint $table) {
            $table->decimal('monto_sistema_usd', 12, 2)->nullable()->after('diferencia');
            $table->decimal('monto_contado_usd', 12, 2)->nullable()->after('monto_sistema_usd');
            $table->decimal('diferencia_usd', 12, 2)->nullable()->after('monto_contado_usd');
        });
    }

    public function down(): void
    {
        Schema::table('cierres_caja', function (Blueprint $table) {
            $table->dropColumn(['monto_sistema_usd', 'monto_contado_usd', 'diferencia_usd']);
        });

        Schema::table('cuentas_por_cobrar', function (Blueprint $table) {
            $table->dropColumn(['numero_cuota', 'total_cuotas', 'moneda']);
        });

        foreach (['nota_venta_pagos', 'cuentas_por_cobrar_pagos'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->dropColumn(['moneda', 'monto_pen', 'tipo_cambio']);
            });
        }

        foreach (['notas_venta', 'ordenes_venta'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->dropColumn('tipo_cambio');
            });
        }
    }
};
