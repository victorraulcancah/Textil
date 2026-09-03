<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('recepciones_compra', function (Blueprint $table) {
            // La recepción nace de una compra, no de la orden.
            $table->foreignId('compra_id')->nullable()->after('orden_compra_id')
                ->constrained('compras')->nullOnDelete();

            // Inactiva = recepción deshecha (su stock fue revertido).
            $table->boolean('activo')->default(true)->after('estado');

            // Cierre de lo pendiente: se pidió 100, llegaron 50 y el resto ya no llega.
            $table->boolean('finalizado')->default(false)->after('activo');
            $table->string('motivo_finalizacion')->nullable()->after('finalizado');
            $table->timestamp('fecha_finalizacion')->nullable()->after('motivo_finalizacion');
        });

        Schema::table('recepcion_compra_detalles', function (Blueprint $table) {
            $table->foreignId('compra_detalle_id')->nullable()->after('orden_compra_detalle_id');
            // Lo que pedía la compra para esta línea, congelado al momento de recepcionar.
            $table->decimal('cantidad_pedida', 12, 2)->default(0)->after('compra_detalle_id');
            // Pendiente que se dio por cerrado al finalizar.
            $table->decimal('cantidad_finalizada', 12, 2)->default(0)->after('cantidad_rechazada');
            // Foto del stock del almacén antes y después de esta línea.
            $table->decimal('stock_anterior', 12, 2)->default(0)->after('costo_unitario');
            $table->decimal('stock_nuevo', 12, 2)->default(0)->after('stock_anterior');
        });
    }

    public function down(): void
    {
        Schema::table('recepcion_compra_detalles', function (Blueprint $table) {
            $table->dropColumn([
                'compra_detalle_id', 'cantidad_pedida', 'cantidad_finalizada',
                'stock_anterior', 'stock_nuevo',
            ]);
        });

        Schema::table('recepciones_compra', function (Blueprint $table) {
            $table->dropForeign(['compra_id']);
            $table->dropColumn([
                'compra_id', 'activo', 'finalizado', 'motivo_finalizacion', 'fecha_finalizacion',
            ]);
        });
    }
};
