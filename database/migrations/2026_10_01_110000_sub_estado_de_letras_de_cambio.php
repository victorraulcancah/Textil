<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dónde está la letra mientras se cobra: en cartera (de la empresa, es como nace),
 * en cobranza libre o en cobranza banco, o descontada en un banco.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            $table->string('sub_estado', 20)->default('en_cartera')->after('estado');
        });
    }

    public function down(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            $table->dropColumn('sub_estado');
        });
    }
};
