<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El color que se traslada. Sin esto no había forma de saber, en una tela de
 * varios colores, cuál de ellos viaja — ni de elegir los rollos correctos al
 * enviar la guía.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transferencia_detalles', function (Blueprint $table) {
            if (! Schema::hasColumn('transferencia_detalles', 'producto_color_id')) {
                $table->foreignId('producto_color_id')
                    ->nullable()
                    ->after('producto_presentacion_id')
                    ->constrained('producto_colores')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('transferencia_detalles', function (Blueprint $table) {
            if (Schema::hasColumn('transferencia_detalles', 'producto_color_id')) {
                $table->dropConstrainedForeignId('producto_color_id');
            }
        });
    }
};
