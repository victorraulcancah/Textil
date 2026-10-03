<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Un pedido por rollos puede pedir un metraje: "1 rollo de 50 m". Si el almacén no tiene un rollo de esa medida,
 * corta la tela de uno más grande. Vacío = rollos enteros, midan lo que midan (como siempre).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('orden_venta_detalles', 'metros_por_rollo')) {
            Schema::table('orden_venta_detalles', function (Blueprint $table) {
                $table->decimal('metros_por_rollo', 10, 2)->nullable()->after('rollos_pedidos');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('orden_venta_detalles', 'metros_por_rollo')) {
            Schema::table('orden_venta_detalles', function (Blueprint $table) {
                $table->dropColumn('metros_por_rollo');
            });
        }
    }
};
