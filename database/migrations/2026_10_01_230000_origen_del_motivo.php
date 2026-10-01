<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El origen del motivo: de dónde viene (Despacho, Compras…), en texto libre. Es aparte de la marca
 * "Sistema / Manual", que dice si el motivo lo genera el sistema o lo creó una persona.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('motivos_movimiento', 'origen')) {
            Schema::table('motivos_movimiento', function (Blueprint $table) {
                $table->string('origen', 100)->nullable()->after('nombre');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('motivos_movimiento', 'origen')) {
            Schema::table('motivos_movimiento', function (Blueprint $table) {
                $table->dropColumn('origen');
            });
        }
    }
};
