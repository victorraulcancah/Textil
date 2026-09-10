<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La importación (el embarque) del que llegó cada rollo.
 *
 * Sin esto no hay forma de responder "¿de qué llegada vino este rollo?", que
 * es lo que se pregunta cuando un lote sale con defecto de fábrica y hay que
 * localizar todo lo que vino en el mismo contenedor.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('importaciones')) {
            Schema::create('importaciones', function (Blueprint $table) {
                $table->id();
                // El código con el que la casa llama al embarque: "IMP-2026-03".
                $table->string('codigo', 60)->unique();
                $table->foreignId('proveedor_id')->nullable()->constrained('proveedores')->nullOnDelete();
                $table->date('fecha_llegada')->nullable();
                // Documento de embarque: BL, DUA, factura del exterior…
                $table->string('documento', 100)->nullable();
                $table->text('observaciones')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasColumn('rollos', 'importacion_id')) {
            Schema::table('rollos', function (Blueprint $table) {
                $table->foreignId('importacion_id')
                    ->nullable()
                    ->after('recepcion_compra_id')
                    ->constrained('importaciones')
                    ->nullOnDelete();
            });
        }

        // Dónde está el rollo dentro del almacén. Las columnas ya existían;
        // lo que faltaba era poder buscarlas.
        Schema::table('rollos', function (Blueprint $table) {
            $table->index(['almacen_id', 'pasillo', 'rack'], 'rollos_ubicacion_idx');
        });
    }

    public function down(): void
    {
        Schema::table('rollos', function (Blueprint $table) {
            $table->dropIndex('rollos_ubicacion_idx');
        });

        if (Schema::hasColumn('rollos', 'importacion_id')) {
            Schema::table('rollos', function (Blueprint $table) {
                $table->dropForeign(['importacion_id']);
                $table->dropColumn('importacion_id');
            });
        }

        Schema::dropIfExists('importaciones');
    }
};
