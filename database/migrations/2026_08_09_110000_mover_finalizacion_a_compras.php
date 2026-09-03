<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La finalización (cerrar lo que ya no va a llegar) se decide sobre la compra,
 * no sobre una recepción concreta. Se mueven los campos a compras.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('compras', function (Blueprint $table) {
            $table->boolean('finalizado')->default(false)->after('estado');
            $table->string('motivo_finalizacion')->nullable()->after('finalizado');
            $table->timestamp('fecha_finalizacion')->nullable()->after('motivo_finalizacion');
        });

        Schema::table('compra_detalles', function (Blueprint $table) {
            // Pendiente que se dio por cerrado al finalizar la compra.
            $table->decimal('cantidad_finalizada', 12, 2)->default(0)->after('cantidad');
        });

        Schema::table('recepciones_compra', function (Blueprint $table) {
            $table->dropColumn(['finalizado', 'motivo_finalizacion', 'fecha_finalizacion']);
        });

        Schema::table('recepcion_compra_detalles', function (Blueprint $table) {
            $table->dropColumn('cantidad_finalizada');
        });
    }

    public function down(): void
    {
        Schema::table('recepcion_compra_detalles', function (Blueprint $table) {
            $table->decimal('cantidad_finalizada', 12, 2)->default(0)->after('cantidad_rechazada');
        });

        Schema::table('recepciones_compra', function (Blueprint $table) {
            $table->boolean('finalizado')->default(false)->after('activo');
            $table->string('motivo_finalizacion')->nullable()->after('finalizado');
            $table->timestamp('fecha_finalizacion')->nullable()->after('motivo_finalizacion');
        });

        Schema::table('compra_detalles', function (Blueprint $table) {
            $table->dropColumn('cantidad_finalizada');
        });

        Schema::table('compras', function (Blueprint $table) {
            $table->dropColumn(['finalizado', 'motivo_finalizacion', 'fecha_finalizacion']);
        });
    }
};
