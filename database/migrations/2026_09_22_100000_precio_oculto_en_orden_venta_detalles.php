<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Con una línea en Rollo no se sabe el metraje exacto hasta pesarlo: el
 * precio (cantidad × precio unitario) es una estimación, no lo que se le va
 * a cobrar de verdad al cliente. Esta columna deja marcarla como "precio por
 * confirmar" para que no entre al subtotal ni se muestre en el pedido.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orden_venta_detalles', function (Blueprint $table) {
            $table->boolean('precio_oculto')->default(false)->after('subtotal');
        });
    }

    public function down(): void
    {
        Schema::table('orden_venta_detalles', function (Blueprint $table) {
            $table->dropColumn('precio_oculto');
        });
    }
};
