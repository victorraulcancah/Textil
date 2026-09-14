<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El color que pidió el cliente en cada línea del pedido.
 *
 * Sin esto, el almacén podía escanear cualquier rollo del producto sin
 * importar el color: el sistema solo comprobaba la tela. Es opcional porque
 * hay productos que no se manejan por color (mercería, insumos).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('orden_venta_detalles', 'producto_color_id')) {
            Schema::table('orden_venta_detalles', function (Blueprint $table) {
                $table->foreignId('producto_color_id')
                    ->nullable()
                    ->after('producto_presentacion_id')
                    ->constrained('producto_colores')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('orden_venta_detalles', 'producto_color_id')) {
            Schema::table('orden_venta_detalles', function (Blueprint $table) {
                $table->dropConstrainedForeignId('producto_color_id');
            });
        }
    }
};
