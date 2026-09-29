<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * El metraje del rollo va por color, no por tela: la tela es un solo producto
 * y cada color es su rollo, con su propio metraje (como la talla de un polo).
 * Sirve para estimar un pedido en rollos de ese color antes de escanearlos.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producto_colores', function (Blueprint $table) {
            $table->decimal('metros_por_rollo', 10, 2)->nullable()->after('nombre_proveedor');
        });

        // Lo que ya se sabía de la tela (su formato "Rollo") es el punto de
        // partida de cada uno de sus colores.
        DB::table('producto_colores')
            ->whereNull('metros_por_rollo')
            ->update([
                'metros_por_rollo' => DB::raw('(select p.metros_por_rollo from productos p where p.id = producto_colores.producto_id)'),
            ]);
    }

    public function down(): void
    {
        Schema::table('producto_colores', function (Blueprint $table) {
            $table->dropColumn('metros_por_rollo');
        });
    }
};
