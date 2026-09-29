<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El bloqueo de crédito (⚫): lo pone a mano quien aprueba líneas de crédito,
 * con su motivo. Mientras dure, nadie le vende a crédito al cliente, ni con
 * autorización; al contado, sí.
 *
 * Los demás estados (al día, con atraso, restringido) no se guardan: se
 * calculan cada vez con las cuotas, los pagos y la línea.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clientes', function (Blueprint $table) {
            $table->boolean('credito_bloqueado')->default(false)->after('tipo_cliente');
            $table->string('credito_bloqueo_motivo', 500)->nullable()->after('credito_bloqueado');
            $table->foreignId('credito_bloqueado_por')->nullable()->after('credito_bloqueo_motivo')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('credito_bloqueado_en')->nullable()->after('credito_bloqueado_por');
        });
    }

    public function down(): void
    {
        Schema::table('clientes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('credito_bloqueado_por');
            $table->dropColumn(['credito_bloqueado', 'credito_bloqueo_motivo', 'credito_bloqueado_en']);
        });
    }
};
