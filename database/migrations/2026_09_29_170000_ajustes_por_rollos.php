<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Un ajuste de una tela se hace por rollos: una entrada crea los rollos de un
 * color (con el metraje que se escriba) y una salida saca metros de un rollo.
 * Estas columnas dejan el rastro para verlo y para revertirlo al eliminar el
 * ajuste.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ajuste_detalles', function (Blueprint $table) {
            $table->foreignId('producto_color_id')->nullable()->after('producto_presentacion_id')
                ->constrained('producto_colores')->nullOnDelete();
            // Salida: el rollo del que se sacaron los metros.
            $table->foreignId('rollo_id')->nullable()->after('producto_color_id')
                ->constrained('rollos')->nullOnDelete();
            // Entrada: cuántos rollos se crearon en esta línea.
            $table->unsignedInteger('rollos')->nullable()->after('rollo_id');
        });

        Schema::table('rollos', function (Blueprint $table) {
            // El rollo nació de esta línea de un ajuste (entrada).
            $table->foreignId('ajuste_detalle_id')->nullable()
                ->constrained('ajuste_detalles')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('rollos', function (Blueprint $table) {
            $table->dropConstrainedForeignId('ajuste_detalle_id');
        });

        Schema::table('ajuste_detalles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('rollo_id');
            $table->dropConstrainedForeignId('producto_color_id');
            $table->dropColumn('rollos');
        });
    }
};
