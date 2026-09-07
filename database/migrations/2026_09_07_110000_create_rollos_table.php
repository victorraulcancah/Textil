<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El rollo es la unidad individual de inventario.
 *
 * El negocio importa telas en rollos y cada rollo trae un metraje distinto:
 * no basta con saber "POLINAN Negro = 1,400 m", hay que saber que son 18
 * rollos de 55, 58, 96, 78 m… Cada uno lleva su etiqueta con código
 * escaneable pegada físicamente.
 *
 * Esta tabla NO reemplaza a producto_almacen_stock: aquel sigue siendo el
 * total por producto y almacén, y los rollos son el detalle que lo compone.
 * Así el kardex, el costeo y los reportes siguen funcionando igual.
 *
 *  - codigo: el SKU propio del sistema (A103-21-0001). Es lo que va en el QR.
 *  - codigo_proveedor: el código tal como lo manda el proveedor chino
 *    (A103-21). Se guarda sin tocarlo para poder cruzar con su packing list.
 *  - metros_inicial / metros_actual: al cortar un pedazo el rollo sigue
 *    existiendo con menos metros y con el mismo código.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rollos', function (Blueprint $table) {
            $table->id();

            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            $table->foreignId('producto_color_id')->nullable()->constrained('producto_colores')->nullOnDelete();
            $table->foreignId('almacen_id')->constrained('almacenes');

            $table->string('codigo')->unique();
            $table->string('codigo_proveedor')->nullable();
            $table->unsignedInteger('numero');

            $table->decimal('metros_inicial', 12, 2);
            $table->decimal('metros_actual', 12, 2);
            $table->decimal('peso_kg', 12, 3)->nullable();
            $table->decimal('costo_unitario', 12, 4)->default(0);

            $table->string('estado', 20)->default('disponible');

            // Ubicación física: almacén → pasillo → rack → nivel → posición.
            $table->string('pasillo', 20)->nullable();
            $table->string('rack', 20)->nullable();
            $table->string('nivel', 20)->nullable();
            $table->string('posicion', 20)->nullable();

            // De dónde vino y a quién se fue.
            $table->foreignId('recepcion_compra_id')->nullable()->constrained('recepciones_compra')->nullOnDelete();
            $table->foreignId('cliente_id')->nullable()->constrained('clientes')->nullOnDelete();

            $table->text('observaciones')->nullable();
            $table->timestamps();

            // El número identifica al rollo dentro de su tela y color.
            $table->unique(['producto_id', 'producto_color_id', 'numero'], 'rollos_numero_unique');

            $table->index(['almacen_id', 'estado']);
            $table->index(['producto_id', 'producto_color_id', 'estado'], 'rollos_stock_index');
            $table->index('metros_actual');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rollos');
    }
};
