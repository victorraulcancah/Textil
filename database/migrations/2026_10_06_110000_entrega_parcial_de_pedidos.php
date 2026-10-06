<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Entrega parcial de un pedido: se despacha lo que ya está preparado y lo que falta se deja pendiente (nace otro
 * pedido con ese saldo) o se cancela, sin anular el pedido ni perder lo preparado.
 *
 *  - `saldo_accion`: lo que se decidió al separar con faltantes ('pendiente' | 'cancelar'); null si salió completo.
 *  - `saldo_detalle`: qué quedó sin entregar, en texto ("POLINAN CE · NEGRO: 1 rollo").
 *  - `orden_origen_id`: en el pedido del saldo, el pedido del que viene.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ordenes_venta', function (Blueprint $table) {
            if (! Schema::hasColumn('ordenes_venta', 'saldo_accion')) {
                $table->string('saldo_accion', 12)->nullable()->after('observaciones');
                $table->text('saldo_detalle')->nullable()->after('saldo_accion');
                $table->foreignId('orden_origen_id')->nullable()->after('saldo_detalle')->constrained('ordenes_venta')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('ordenes_venta', function (Blueprint $table) {
            if (Schema::hasColumn('ordenes_venta', 'saldo_accion')) {
                $table->dropConstrainedForeignId('orden_origen_id');
                $table->dropColumn(['saldo_detalle', 'saldo_accion']);
            }
        });
    }
};
