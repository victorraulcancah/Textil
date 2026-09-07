<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La línea del pedido dice también en qué presentación se vende el rollo.
 *
 * Sin esto el pedido no podría convertirse en nota de venta: el stock y el
 * precio viven en la presentación ("Metro", "Rollo 50 m"). Además así siguen
 * valiendo las reglas por almacén — un local que solo vende en Rollo no puede
 * despachar metros sueltos.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orden_venta_rollos', function (Blueprint $table) {
            $table->foreignId('producto_presentacion_id')
                ->nullable()
                ->after('rollo_id')
                ->constrained('producto_presentaciones')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('orden_venta_rollos', function (Blueprint $table) {
            $table->dropConstrainedForeignId('producto_presentacion_id');
        });
    }
};
