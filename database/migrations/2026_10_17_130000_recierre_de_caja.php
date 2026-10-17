<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Recierre: corregir los datos de un cierre ya hecho (lo contado, lo que se deja, los dólares, la caja destino) sin
 * reabrir la caja. Queda constancia de quién lo corrigió, cuándo, por qué y cuántas veces.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cierres_caja', function (Blueprint $table) {
            $table->foreignId('recerrado_por')->nullable()->after('anulado_motivo')->constrained('users')->nullOnDelete();
            $table->dateTime('recerrado_en')->nullable()->after('recerrado_por');
            $table->string('recerrado_motivo')->nullable()->after('recerrado_en');
            $table->unsignedSmallInteger('veces_recerrado')->default(0)->after('recerrado_motivo');
        });
    }

    public function down(): void
    {
        Schema::table('cierres_caja', function (Blueprint $table) {
            $table->dropConstrainedForeignId('recerrado_por');
            $table->dropColumn(['recerrado_en', 'recerrado_motivo', 'veces_recerrado']);
        });
    }
};
