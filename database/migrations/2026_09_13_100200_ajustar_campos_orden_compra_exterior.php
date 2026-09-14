<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ajusta los campos de compra al exterior al formato real que usa el cliente
 * (su Purchase Order a China): tipo de carga, contenedor, medio de embarque,
 * país de origen/destino, quién la preparó y quién la aprobó. Los tres campos
 * que se habían adivinado sin ese ejemplo (naviera, agente de aduana, días de
 * tránsito) no aparecen en su formato y se quitan.
 *
 * También agrega lo que falta para el resto del documento:
 *   - proveedores: tax_id y fax (el proveedor extranjero no tiene RUC
 *     peruano) y país.
 *   - productos: código arancelario (HS code), que es propio de la tela y no
 *     de cada orden.
 *   - orden_compra_detalles: color y cantidad de rollos por línea — la orden
 *     de importación pide "120 rollos de Negro", no solo metros.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('ordenes_compra', 'naviera')) {
            Schema::table('ordenes_compra', function (Blueprint $table) {
                $table->dropColumn(['naviera', 'agente_aduana', 'dias_transito']);
            });
        }

        if (! Schema::hasColumn('ordenes_compra', 'cargo_type')) {
            Schema::table('ordenes_compra', function (Blueprint $table) {
                $table->string('cargo_type', 20)->nullable()->after('tipo');
                $table->string('medio_transporte', 20)->nullable()->after('cargo_type');
                $table->string('pais_origen', 100)->nullable()->after('incoterm');
                $table->string('pais_destino', 100)->nullable()->after('pais_origen');
                $table->string('elaborado_por', 150)->nullable()->after('fecha_embarque_estimada');
                $table->string('aprobado_por', 150)->nullable()->after('elaborado_por');
            });
        }

        if (! Schema::hasColumn('proveedores', 'tax_id')) {
            Schema::table('proveedores', function (Blueprint $table) {
                $table->string('tax_id', 50)->nullable()->after('ruc');
                $table->string('fax', 30)->nullable()->after('telefono');
                $table->string('pais', 100)->nullable()->after('direccion');
            });
        }

        if (! Schema::hasColumn('productos', 'codigo_arancelario')) {
            Schema::table('productos', function (Blueprint $table) {
                $table->string('codigo_arancelario', 20)->nullable()->after('composicion');
            });
        }

        if (! Schema::hasColumn('orden_compra_detalles', 'producto_color_id')) {
            Schema::table('orden_compra_detalles', function (Blueprint $table) {
                $table->foreignId('producto_color_id')
                    ->nullable()
                    ->after('producto_presentacion_id')
                    ->constrained('producto_colores')
                    ->nullOnDelete();
                // Cuántos rollos se piden de ese color; `cantidad` sigue
                // siendo los metros (lo que ya vale la línea, en la unidad de
                // la presentación), que es lo que se factura y se recibe.
                $table->unsignedInteger('rollos')->nullable()->after('cantidad');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('orden_compra_detalles', 'producto_color_id')) {
            Schema::table('orden_compra_detalles', function (Blueprint $table) {
                $table->dropConstrainedForeignId('producto_color_id');
                $table->dropColumn('rollos');
            });
        }

        if (Schema::hasColumn('productos', 'codigo_arancelario')) {
            Schema::table('productos', fn (Blueprint $table) => $table->dropColumn('codigo_arancelario'));
        }

        if (Schema::hasColumn('proveedores', 'tax_id')) {
            Schema::table('proveedores', fn (Blueprint $table) => $table->dropColumn(['tax_id', 'fax', 'pais']));
        }

        if (Schema::hasColumn('ordenes_compra', 'cargo_type')) {
            Schema::table('ordenes_compra', function (Blueprint $table) {
                $table->dropColumn(['cargo_type', 'medio_transporte', 'pais_origen', 'pais_destino', 'elaborado_por', 'aprobado_por']);
            });
        }
    }
};
