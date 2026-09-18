<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dónde y cuánto apartó cada línea del pedido al solicitarse.
 *
 * El vendedor no elige almacén: la reserva cae en el que más disponible
 * tenga del producto. Se guarda para liberar exactamente eso al despachar,
 * anular o devolver el pedido a borrador.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orden_venta_detalles', function (Blueprint $table) {
            if (! Schema::hasColumn('orden_venta_detalles', 'reserva_almacen_id')) {
                $table->foreignId('reserva_almacen_id')
                    ->nullable()
                    ->after('metros')
                    ->constrained('almacenes')
                    ->nullOnDelete();
            }

            if (! Schema::hasColumn('orden_venta_detalles', 'cantidad_reservada')) {
                $table->decimal('cantidad_reservada', 12, 2)->nullable()->after('reserva_almacen_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orden_venta_detalles', function (Blueprint $table) {
            if (Schema::hasColumn('orden_venta_detalles', 'cantidad_reservada')) {
                $table->dropColumn('cantidad_reservada');
            }

            if (Schema::hasColumn('orden_venta_detalles', 'reserva_almacen_id')) {
                $table->dropConstrainedForeignId('reserva_almacen_id');
            }
        });
    }
};
