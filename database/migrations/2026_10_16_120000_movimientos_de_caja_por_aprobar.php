<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El ingreso que otra caja envía al cerrar aparece de inmediato en la caja destino, pero "por aprobar": se ve en su
 * lista y no cuenta en sus totales hasta que se aprueba el cierre.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('movimientos_caja', function (Blueprint $table) {
            $table->boolean('por_aprobar')->default(false)->after('anulado_por')->index();
        });
    }

    public function down(): void
    {
        Schema::table('movimientos_caja', function (Blueprint $table) {
            $table->dropColumn('por_aprobar');
        });
    }
};
