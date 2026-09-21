<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El tipo de cambio con el que se calcularon los precios de un producto que se
 * compra en una moneda y se vende en otra (dólares → soles).
 *
 * Sin él, el precio de venta sugerido a partir del % de ganancia se calculaba
 * sobre la cifra en dólares tal cual y se guardaba como si fueran soles. Aquí
 * solo se recuerda la tasa usada; la ganancia real de cada compra sigue
 * calculándose con el tipo de cambio de esa compra al recepcionarla.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('productos', 'tipo_cambio')) {
            Schema::table('productos', function (Blueprint $table) {
                $table->decimal('tipo_cambio', 10, 4)->nullable()->after('moneda_venta');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('productos', 'tipo_cambio')) {
            Schema::table('productos', function (Blueprint $table) {
                $table->dropColumn('tipo_cambio');
            });
        }
    }
};
