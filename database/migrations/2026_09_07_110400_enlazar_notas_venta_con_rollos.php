<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La nota de venta es el cierre del pedido, y también sigue existiendo sola.
 *
 * Hay dos caminos hacia una venta:
 *   - Mayorista: pedido → separación → despacho → nota de venta.
 *   - Mostrador: el cliente llega, escanea, paga. Nota de venta directa.
 *
 * Por eso ambos enlaces son opcionales: una nota sin orden es una venta de
 * mostrador, y un detalle sin rollo es un producto que no se maneja por
 * rollos (un cono de hilo, un accesorio).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notas_venta', function (Blueprint $table) {
            $table->foreignId('orden_venta_id')
                ->nullable()
                ->after('cliente_id')
                ->constrained('ordenes_venta')
                ->nullOnDelete();
        });

        Schema::table('nota_venta_detalles', function (Blueprint $table) {
            $table->foreignId('rollo_id')
                ->nullable()
                ->after('producto_presentacion_id')
                ->constrained('rollos')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('nota_venta_detalles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('rollo_id');
        });

        Schema::table('notas_venta', function (Blueprint $table) {
            $table->dropConstrainedForeignId('orden_venta_id');
        });
    }
};
