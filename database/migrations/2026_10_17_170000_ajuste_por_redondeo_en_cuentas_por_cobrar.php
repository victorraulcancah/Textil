<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lo que falta por cobrar de una cuenta en soles, si es menos de S/ 1, ya no se cobra: se perdona como «ajuste por
 * redondeo» y la cuenta queda cancelada. Aquí queda cuánto fue, para que no desaparezca sin rastro.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cuentas_por_cobrar', function (Blueprint $table) {
            $table->decimal('ajuste_redondeo', 12, 2)->default(0)->after('saldo');
        });
    }

    public function down(): void
    {
        Schema::table('cuentas_por_cobrar', function (Blueprint $table) {
            $table->dropColumn('ajuste_redondeo');
        });
    }
};
