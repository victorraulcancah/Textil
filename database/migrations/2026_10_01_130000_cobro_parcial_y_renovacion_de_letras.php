<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cobro parcial y renovación de letras. Una letra se puede cobrar por partes: lo que
 * falta es su saldo. Si el resto no se cobra, se renueva: una letra nueva por el saldo
 * y la anterior queda cancelada (lo que debía ya se pagó o pasó a la nueva).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            // Lo que falta cobrar de la letra y lo que ya se cobró.
            $table->decimal('saldo', 14, 2)->default(0)->after('importe');
            $table->decimal('monto_pagado', 14, 2)->default(0)->after('saldo');
            // Si nació de renovar otra, cuál era.
            $table->foreignId('letra_anterior_id')->nullable()->after('cuenta_por_cobrar_id')
                ->constrained('letras_cambio')->nullOnDelete();
        });

        // Las letras que ya existían: por cobrar tienen todo su importe de saldo; las pagadas, nada.
        DB::table('letras_cambio')->where('estado', 'emitida')->update(['saldo' => DB::raw('importe')]);
        DB::table('letras_cambio')->where('estado', 'pagada')->update(['monto_pagado' => DB::raw('importe')]);
    }

    public function down(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            $table->dropConstrainedForeignId('letra_anterior_id');
            $table->dropColumn(['saldo', 'monto_pagado']);
        });
    }
};
