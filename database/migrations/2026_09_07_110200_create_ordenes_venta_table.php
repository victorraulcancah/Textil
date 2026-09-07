<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El pedido del cliente, desde que se toma hasta que se despacha.
 *
 * Es un solo documento que camina por estados; NO mueve stock en ningún
 * momento. Los rollos quedan marcados como separados —así nadie más los
 * vende— pero siguen contando en el inventario porque físicamente están en
 * el almacén. El descuento ocurre una sola vez, al emitir la nota de venta.
 *
 *   borrador → separada → en_preparacion → despachada → facturada
 *                                                     ↘ anulada
 *
 * El "requerimiento de almacén" que pide el cliente no es otro documento:
 * es esta misma orden impresa para el almacenero, con su propio correlativo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ordenes_venta', function (Blueprint $table) {
            $table->id();

            $table->string('serie', 10)->default('OV');
            $table->string('numero', 20);

            $table->foreignId('cliente_id')->nullable()->constrained('clientes')->nullOnDelete();
            $table->foreignId('almacen_id')->constrained('almacenes');
            $table->foreignId('vendedor_id')->constrained('users');

            $table->date('fecha_emision');
            $table->date('fecha_entrega')->nullable();

            $table->string('estado', 20)->default('borrador');
            $table->string('moneda', 10)->default('PEN');

            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('descuento_total', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);

            // Correlativo del requerimiento de almacén (RA-000125). Se llena
            // cuando la orden pasa a preparación.
            $table->string('requerimiento_numero', 20)->nullable();

            $table->timestamp('fecha_separacion')->nullable();
            $table->timestamp('fecha_preparacion')->nullable();
            $table->timestamp('fecha_despacho')->nullable();

            $table->foreignId('usuario_prepara_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('usuario_despacha_id')->nullable()->constrained('users')->nullOnDelete();

            $table->text('motivo_anulacion')->nullable();
            $table->foreignId('usuario_anula_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('fecha_anulacion')->nullable();

            $table->text('observaciones')->nullable();
            $table->timestamps();

            $table->unique(['serie', 'numero']);
            $table->index(['estado', 'fecha_emision']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ordenes_venta');
    }
};
