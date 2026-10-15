<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * El efectivo que sale de una caja al cerrar puede ir a otra caja: es un egreso para quien cierra y, al aprobarse el
 * cierre, un ingreso del sistema en la caja destino.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cierres_caja', function (Blueprint $table) {
            $table->foreignId('caja_destino_id')->nullable()->after('monto_retirado')->constrained('cajas')->nullOnDelete();
            // El ingreso que se creó en la caja destino al aprobar (para anularlo si se anula el cierre).
            $table->foreignId('movimiento_destino_id')->nullable()->after('movimiento_caja_id')->constrained('movimientos_caja')->nullOnDelete();
        });

        DB::table('motivos_movimiento')->updateOrInsert(
            ['nombre' => 'Ingreso por cierre de caja', 'tipo' => 'entrada', 'ambito' => 'caja'],
            ['es_sistema' => true, 'activo' => true, 'categoria_gasto' => null, 'created_at' => now(), 'updated_at' => now()],
        );
    }

    public function down(): void
    {
        Schema::table('cierres_caja', function (Blueprint $table) {
            $table->dropConstrainedForeignId('movimiento_destino_id');
            $table->dropConstrainedForeignId('caja_destino_id');
        });
    }
};
