<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Quién aprobó y quién envió cada orden de compra, y cuándo: hasta ahora
 * "estado" tenía aprobada/enviada como valores posibles pero nada en el
 * sistema los escribía (la orden se quedaba en pendiente para siempre).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ordenes_compra', function (Blueprint $table) {
            $table->foreignId('usuario_aprueba_id')->nullable()->after('usuario_crea_id')->constrained('users')->nullOnDelete();
            $table->timestamp('fecha_aprobacion')->nullable()->after('usuario_aprueba_id');
            $table->foreignId('usuario_envia_id')->nullable()->after('fecha_aprobacion')->constrained('users')->nullOnDelete();
            $table->timestamp('fecha_envio')->nullable()->after('usuario_envia_id');
        });
    }

    public function down(): void
    {
        Schema::table('ordenes_compra', function (Blueprint $table) {
            $table->dropConstrainedForeignId('usuario_aprueba_id');
            $table->dropConstrainedForeignId('usuario_envia_id');
            $table->dropColumn(['fecha_aprobacion', 'fecha_envio']);
        });
    }
};
