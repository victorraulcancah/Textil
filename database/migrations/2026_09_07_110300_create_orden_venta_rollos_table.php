<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El detalle del pedido: qué rollos se llevan y cuántos metros de cada uno.
 *
 * La línea es un rollo, no un producto: por eso el cliente puede pedir
 * "los rollos 001 al 005 del negro" y el almacenero sabe exactamente cuáles
 * bajar del rack.
 *
 * Si `metros` es menor que el metraje del rollo, es una venta parcial: se
 * corta el pedazo y el rollo sigue existiendo con el mismo código y menos
 * metros.
 *
 * `escaneado_at` guarda la verificación por QR en el despacho: el almacenero
 * escanea cada rollo y el sistema confirma que corresponde al pedido.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orden_venta_rollos', function (Blueprint $table) {
            $table->id();

            $table->foreignId('orden_venta_id')->constrained('ordenes_venta')->cascadeOnDelete();
            $table->foreignId('rollo_id')->constrained('rollos');

            $table->decimal('metros', 12, 2);
            $table->decimal('precio_unitario', 12, 2)->default(0);
            $table->decimal('descuento', 12, 2)->default(0);
            $table->decimal('subtotal', 12, 2)->default(0);

            $table->timestamp('escaneado_at')->nullable();
            $table->foreignId('usuario_escanea_id')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            // Un rollo entra una sola vez por pedido.
            $table->unique(['orden_venta_id', 'rollo_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orden_venta_rollos');
    }
};
