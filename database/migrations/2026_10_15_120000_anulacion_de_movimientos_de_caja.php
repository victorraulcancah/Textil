<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Un movimiento de caja anulado ya no se borra: queda registrado, fuera de los totales, con su motivo y quién lo
 * anuló. Así Mi Caja muestra el cobro que se corrigió junto al nuevo y se puede seguir la historia.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('movimientos_caja', function (Blueprint $table) {
            if (! Schema::hasColumn('movimientos_caja', 'deleted_at')) {
                $table->softDeletes();
            }
            if (! Schema::hasColumn('movimientos_caja', 'anulado_motivo')) {
                $table->string('anulado_motivo')->nullable()->after('deleted_at');
            }
            if (! Schema::hasColumn('movimientos_caja', 'anulado_por')) {
                $table->foreignId('anulado_por')->nullable()->after('anulado_motivo')->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('movimientos_caja', function (Blueprint $table) {
            if (Schema::hasColumn('movimientos_caja', 'anulado_por')) {
                $table->dropConstrainedForeignId('anulado_por');
            }
            if (Schema::hasColumn('movimientos_caja', 'anulado_motivo')) {
                $table->dropColumn('anulado_motivo');
            }
            if (Schema::hasColumn('movimientos_caja', 'deleted_at')) {
                $table->dropSoftDeletes();
            }
        });
    }
};
