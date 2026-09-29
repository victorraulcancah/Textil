<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * La lista de precios: un producto se vende a distintos precios según el
 * tipo de cliente (minorista, mayorista…) y según cuánto lleve.
 *
 *   tipos_precio       Minorista, Mayorista… cada uno con su % sugerido. El
 *                      principal es el precio de siempre.
 *   producto_precios   precio de una presentación, para un tipo de precio,
 *                      desde una cantidad (Metro desde 100 → más barato).
 *
 * El precio principal "desde 1" sigue siendo `producto_presentaciones.precio_venta`:
 * es el que ya usan pedidos, ventas, reportes y PDF, así que no se duplica.
 * Aquí viven los demás tipos y los precios por cantidad.
 *
 * Además: qué productos llevan IGV (su precio ya lo incluye) y el tipo de
 * precio de cada cliente.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tipos_precio', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 60)->unique();
            // % de ganancia sugerido sobre el costo, para llenar la lista de un golpe.
            $table->decimal('margen', 8, 2)->nullable();
            // El precio de siempre: el que tiene cada presentación.
            $table->boolean('principal')->default(false);
            $table->unsignedInteger('orden')->default(0);
            $table->boolean('activo')->default(true);
            $table->timestamps();
        });

        Schema::create('producto_precios', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_presentacion_id')->constrained('producto_presentaciones')->cascadeOnDelete();
            $table->foreignId('tipo_precio_id')->constrained('tipos_precio')->cascadeOnDelete();
            // Desde cuántas unidades de la presentación rige este precio.
            $table->decimal('desde', 12, 2)->default(1);
            $table->decimal('precio', 12, 4);
            $table->decimal('margen', 8, 2)->nullable();
            $table->timestamps();

            $table->unique(['producto_presentacion_id', 'tipo_precio_id', 'desde'], 'producto_precios_unico');
        });

        Schema::table('productos', function (Blueprint $table) {
            // El precio de venta ya incluye el IGV (18%).
            $table->boolean('afecto_igv')->default(false)->after('tipo_cambio');
        });

        Schema::table('clientes', function (Blueprint $table) {
            // A qué precio se le vende. Sin uno, al principal.
            $table->foreignId('tipo_precio_id')->nullable()->after('ejecutivo_id')
                ->constrained('tipos_precio')->nullOnDelete();
        });

        DB::table('tipos_precio')->insert([
            'nombre' => 'Minorista',
            'margen' => 25,
            'principal' => true,
            'orden' => 1,
            'activo' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::table('clientes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tipo_precio_id');
        });

        Schema::table('productos', function (Blueprint $table) {
            $table->dropColumn('afecto_igv');
        });

        Schema::dropIfExists('producto_precios');
        Schema::dropIfExists('tipos_precio');
    }
};
