<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Atención parcial de un requerimiento de traslado: si falta alguna tela al prepararlo, se despacha lo escaneado y lo
 * que falta se deja pendiente (nace otro requerimiento con ese saldo) o se cancela.
 *
 *  - `saldo_accion`: lo que se decidió al separar con faltantes ('pendiente' | 'cancelar'); null si salió completo.
 *  - `saldo_detalle`: qué quedó sin atender, en texto ("POLINAN CE · NEGRO: 2 rollo(s)").
 *  - `requerimiento_origen_id`: en el requerimiento del saldo, el requerimiento del que viene.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transferencias', function (Blueprint $table) {
            if (! Schema::hasColumn('transferencias', 'saldo_accion')) {
                $table->string('saldo_accion', 12)->nullable()->after('motivo_rechazo');
                $table->text('saldo_detalle')->nullable()->after('saldo_accion');
                $table->foreignId('requerimiento_origen_id')->nullable()->after('saldo_detalle')->constrained('transferencias')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('transferencias', function (Blueprint $table) {
            if (Schema::hasColumn('transferencias', 'saldo_accion')) {
                $table->dropConstrainedForeignId('requerimiento_origen_id');
                $table->dropColumn(['saldo_detalle', 'saldo_accion']);
            }
        });
    }
};
