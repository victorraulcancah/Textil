<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Los tres campos que le faltaban a Compra para calzar del todo con la orden. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('compras', function (Blueprint $table) {
            $table->date('fecha_embarque_estimada')->nullable()->after('fecha_llegada');
            $table->string('elaborado_por', 100)->nullable()->after('fecha_embarque_estimada');
            $table->string('aprobado_por', 100)->nullable()->after('elaborado_por');
        });
    }

    public function down(): void
    {
        Schema::table('compras', function (Blueprint $table) {
            $table->dropColumn(['fecha_embarque_estimada', 'elaborado_por', 'aprobado_por']);
        });
    }
};
