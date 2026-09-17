<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Orden de compra y Compra son casi lo mismo —la segunda nace de la primera,
 * al convertirla cuando llega la factura— pero traían campos distintos: la
 * orden ya preguntaba el color por línea y los datos de embarque al
 * exterior, y la compra no tenía dónde guardarlos. Por eso "Convertir en
 * compra" perdía esos datos en el camino.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('compras', function (Blueprint $table) {
            // Los mismos datos de embarque que ya pregunta la orden de
            // compra al exterior. "numero_contenedor" no se repite: ya
            // existe como "contenedor" en esta tabla.
            $table->string('cargo_type', 30)->nullable()->after('numero_importacion');
            $table->string('medio_transporte', 30)->nullable()->after('cargo_type');
            $table->string('incoterm', 10)->nullable()->after('medio_transporte');
            $table->string('pais_destino', 100)->nullable()->after('pais_origen');
            $table->string('puerto_embarque', 100)->nullable()->after('pais_destino');
            $table->string('puerto_destino', 100)->nullable()->after('puerto_embarque');
        });

        Schema::table('compra_detalles', function (Blueprint $table) {
            // Igual que en la orden: en qué color viene esa línea, y en
            // cuántos rollos. Sin esto, el color recién se elegía al
            // recepcionar, aunque la orden ya lo supiera de antes.
            $table->foreignId('producto_color_id')->nullable()->after('producto_presentacion_id')
                ->constrained('producto_colores')->nullOnDelete();
            $table->unsignedInteger('rollos')->nullable()->after('cantidad');
        });
    }

    public function down(): void
    {
        Schema::table('compra_detalles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('producto_color_id');
            $table->dropColumn('rollos');
        });

        Schema::table('compras', function (Blueprint $table) {
            $table->dropColumn([
                'cargo_type', 'medio_transporte', 'incoterm',
                'pais_destino', 'puerto_embarque', 'puerto_destino',
            ]);
        });
    }
};
