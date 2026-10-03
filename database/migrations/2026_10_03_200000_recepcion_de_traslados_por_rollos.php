<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Recepción de un traslado escaneando el QR de cada rollo. Los rollos viajan "en tránsito" y quedan disponibles en el
 * almacén destino recién cuando se escanean (o cuando se recibe todo de golpe).
 *
 * `rollo_viaja_id` es el rollo que de verdad llega: el mismo si salió entero; si fue un corte, la parte nueva (-B) con
 * su propio código. `rollo_id` sigue siendo el rollo de origen.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transferencia_rollos', function (Blueprint $table) {
            if (! Schema::hasColumn('transferencia_rollos', 'rollo_viaja_id')) {
                $table->foreignId('rollo_viaja_id')->nullable()->after('rollo_id')->constrained('rollos')->nullOnDelete();
                $table->timestamp('recibido_at')->nullable()->after('escaneado_at');
                $table->foreignId('usuario_recibe_id')->nullable()->after('recibido_at')->constrained('users')->nullOnDelete();
            }
        });

        Schema::table('transferencias', function (Blueprint $table) {
            if (! Schema::hasColumn('transferencias', 'observacion_recepcion')) {
                $table->text('observacion_recepcion')->nullable()->after('motivo_rechazo');
            }
        });

        // Lo que ya salió antes de este cambio viajó con el mismo rollo.
        DB::table('transferencia_rollos')->whereNull('rollo_viaja_id')->update(['rollo_viaja_id' => DB::raw('rollo_id')]);
    }

    public function down(): void
    {
        Schema::table('transferencia_rollos', function (Blueprint $table) {
            if (Schema::hasColumn('transferencia_rollos', 'rollo_viaja_id')) {
                $table->dropConstrainedForeignId('usuario_recibe_id');
                $table->dropConstrainedForeignId('rollo_viaja_id');
                $table->dropColumn('recibido_at');
            }
        });
        Schema::table('transferencias', function (Blueprint $table) {
            if (Schema::hasColumn('transferencias', 'observacion_recepcion')) {
                $table->dropColumn('observacion_recepcion');
            }
        });
    }
};
