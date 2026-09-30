<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Quién aprueba una orden de compra: se elige de la lista de usuarios al
 * armarla y solo esa persona puede aprobarla. Mientras no esté aprobada, la
 * orden no se puede transformar en compra.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ordenes_compra', function (Blueprint $table) {
            $table->foreignId('aprobador_id')->nullable()->after('aprobado_por')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('ordenes_compra', function (Blueprint $table) {
            $table->dropConstrainedForeignId('aprobador_id');
        });
    }
};
