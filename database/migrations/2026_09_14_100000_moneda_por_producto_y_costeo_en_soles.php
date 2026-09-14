<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La moneda en la que normalmente se compra y se vende cada tela.
 *
 * Las compras al exterior son en dólares y las ventas en soles: el mismo
 * producto tiene dos monedas distintas según de qué lado se le mire. Esto es
 * solo la etiqueta — de qué moneda son los precios que ya tiene el producto—;
 * la conversión real ocurre al recepcionar (ver la otra migración de hoy).
 *
 * `costo_unitario_pen` en la recepción guarda el costo ya convertido a soles
 * que de verdad se usó para valorizar el stock, para poder deshacer la
 * recepción sin tener que volver a adivinar el tipo de cambio de ese día.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('productos', 'moneda_compra')) {
            Schema::table('productos', function (Blueprint $table) {
                $table->string('moneda_compra', 10)->default('PEN')->after('precio_base');
                $table->string('moneda_venta', 10)->default('PEN')->after('moneda_compra');
            });
        }

        if (! Schema::hasColumn('recepcion_compra_detalles', 'costo_unitario_pen')) {
            Schema::table('recepcion_compra_detalles', function (Blueprint $table) {
                $table->decimal('costo_unitario_pen', 12, 4)->nullable()->after('costo_unitario');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('recepcion_compra_detalles', 'costo_unitario_pen')) {
            Schema::table('recepcion_compra_detalles', function (Blueprint $table) {
                $table->dropColumn('costo_unitario_pen');
            });
        }

        if (Schema::hasColumn('productos', 'moneda_compra')) {
            Schema::table('productos', function (Blueprint $table) {
                $table->dropColumn(['moneda_compra', 'moneda_venta']);
            });
        }
    }
};
