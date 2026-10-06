<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lo que no se encuentra al preparar un pedido ya no genera otro pedido (queda registrado como NO ENCONTRADO y el pedido
 * se cierra con lo despachado), así que el vínculo "pedido de saldo" no se usa.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('ordenes_venta', 'orden_origen_id')) {
            Schema::table('ordenes_venta', function (Blueprint $table) {
                $table->dropConstrainedForeignId('orden_origen_id');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('ordenes_venta', 'orden_origen_id')) {
            Schema::table('ordenes_venta', function (Blueprint $table) {
                $table->foreignId('orden_origen_id')->nullable()->after('saldo_detalle')->constrained('ordenes_venta')->nullOnDelete();
            });
        }
    }
};
