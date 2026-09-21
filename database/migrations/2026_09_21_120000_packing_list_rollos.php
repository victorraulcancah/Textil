<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El packing list de una compra, rollo por rollo, mientras la mercadería llega.
 *
 * Cargar el Excel deja cada rollo "pendiente de recibir": todavía no es stock.
 * Al escanearlo en el almacén pasa a "recibido" —con quién y cuándo— y recién al
 * confirmar la recepción se vuelve un rollo de verdad ("registrado"). Así varios
 * almaceneros pueden recibir la misma compra a la vez, cada uno con su usuario,
 * y un rollo no se cuenta dos veces.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('packing_list_rollos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('compra_id')->constrained('compras')->cascadeOnDelete();
            $table->foreignId('compra_detalle_id')->constrained('compra_detalles')->cascadeOnDelete();
            $table->foreignId('producto_color_id')->nullable()->constrained('producto_colores')->nullOnDelete();
            // El código único que la fábrica imprimió en la etiqueta (y en su QR).
            $table->string('codigo', 100);
            $table->decimal('metros', 10, 2);
            $table->decimal('peso_kg', 10, 3)->nullable();
            // Del Excel: a qué envío pertenece, si la fábrica manda por partes.
            $table->string('envio', 50)->nullable();
            // pendiente | recibido | registrado
            $table->string('estado', 20)->default('pendiente');
            $table->foreignId('usuario_carga_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('usuario_escanea_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('escaneado_at')->nullable();
            $table->foreignId('recepcion_id')->nullable()->constrained('recepciones_compra')->nullOnDelete();
            $table->timestamps();

            $table->unique(['compra_id', 'codigo']);
            $table->index(['compra_id', 'estado']);
        });

        // Quién recibió cada rollo en el almacén, para que no se pierda al
        // convertirse en stock.
        if (! Schema::hasColumn('rollos', 'usuario_recibe_id')) {
            Schema::table('rollos', function (Blueprint $table) {
                $table->foreignId('usuario_recibe_id')->nullable()->after('recepcion_compra_id')
                    ->constrained('users')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('rollos', 'usuario_recibe_id')) {
            Schema::table('rollos', function (Blueprint $table) {
                $table->dropConstrainedForeignId('usuario_recibe_id');
            });
        }

        Schema::dropIfExists('packing_list_rollos');
    }
};
