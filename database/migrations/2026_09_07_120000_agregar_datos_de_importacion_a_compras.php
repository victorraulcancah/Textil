<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Datos de la importación en la compra.
 *
 * La tela llega en contenedores desde el extranjero, y de cada rollo hay que
 * poder decir de qué embarque vino: es lo que permite reclamar al proveedor
 * cuando un lote sale defectuoso, y explicar por qué dos rollos de la misma
 * tela tienen costos distintos.
 *
 * Todo es opcional: una compra local no tiene contenedor ni BL, y el
 * formulario solo muestra estos campos cuando se marca la compra como
 * importación.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('compras', function (Blueprint $table) {
            $table->boolean('es_importacion')->default(false)->after('flete');

            $table->string('numero_importacion', 40)->nullable()->after('es_importacion');
            $table->string('contenedor', 40)->nullable()->after('numero_importacion');
            $table->string('precinto', 40)->nullable()->after('contenedor');
            // Bill of Lading: el conocimiento de embarque marítimo.
            $table->string('bl', 60)->nullable()->after('precinto');
            $table->string('pais_origen', 60)->nullable()->after('bl');
            $table->date('fecha_llegada')->nullable()->after('pais_origen');

            $table->string('moneda_origen', 10)->default('PEN')->after('fecha_llegada');
            // Con cuántos soles se pagó cada dólar de esta importación.
            $table->decimal('tipo_cambio', 12, 4)->nullable()->after('moneda_origen');

            $table->index('numero_importacion');
            $table->index('contenedor');
        });
    }

    public function down(): void
    {
        Schema::table('compras', function (Blueprint $table) {
            $table->dropIndex(['numero_importacion']);
            $table->dropIndex(['contenedor']);
            $table->dropColumn([
                'es_importacion',
                'numero_importacion',
                'contenedor',
                'precinto',
                'bl',
                'pais_origen',
                'fecha_llegada',
                'moneda_origen',
                'tipo_cambio',
            ]);
        });
    }
};
