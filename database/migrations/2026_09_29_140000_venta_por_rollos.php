<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * La tela se vende por rollos, pero se cobra por metro: cada rollo con su
 * metraje real (el que trae del packing list), no con un metraje fijo.
 *
 *  - productos.metros_por_rollo: el metraje promedio de un rollo, solo para
 *    estimar un pedido en rollos antes de saber qué rollos salen.
 *  - orden_venta_detalles: la línea se pide en `rollos` (N rollos enteros) o
 *    en `metros` (X metros, cortando de un rollo si hace falta).
 *  - orden_venta_rollos / nota_venta_detalles: cuánto medía el rollo al
 *    tomarlo (el "factor") y si salió entero o fue un corte.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            $table->decimal('metros_por_rollo', 10, 2)->nullable()->after('factor_compra_base');
        });

        Schema::table('orden_venta_detalles', function (Blueprint $table) {
            $table->string('modo', 10)->default('metros')->after('producto_color_id');
            $table->unsignedSmallInteger('rollos_pedidos')->nullable()->after('modo');
        });

        Schema::table('orden_venta_rollos', function (Blueprint $table) {
            $table->decimal('metros_rollo', 10, 2)->nullable()->after('metros');
            $table->boolean('entero')->default(false)->after('metros_rollo');
        });

        Schema::table('nota_venta_detalles', function (Blueprint $table) {
            $table->decimal('metros_rollo', 10, 2)->nullable()->after('rollo_id');
            $table->boolean('rollo_entero')->default(false)->after('metros_rollo');
        });

        // El promedio de las telas que ya existen sale de su formato "Rollo":
        // cuántos metros vale, medido en su formato "Metro".
        $presentaciones = DB::table('producto_presentaciones as pp')
            ->leftJoin('unidades_medida as u', 'u.id', '=', 'pp.unidad_base_id')
            ->get(['pp.producto_id', 'pp.nombre', 'pp.factor_conversion', 'u.abreviatura']);

        $presentaciones->groupBy('producto_id')->each(function ($lista, $productoId) {
            $metro = $lista->first(fn ($p) => strtolower((string) $p->abreviatura) === 'm');
            $rollo = $lista->first(fn ($p) => stripos((string) $p->nombre, 'rollo') !== false
                || strtolower((string) $p->abreviatura) === 'rollo');

            if ($metro && $rollo && (float) $metro->factor_conversion > 0) {
                DB::table('productos')->where('id', $productoId)->update([
                    'metros_por_rollo' => round((float) $rollo->factor_conversion / (float) $metro->factor_conversion, 2),
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('nota_venta_detalles', function (Blueprint $table) {
            $table->dropColumn(['metros_rollo', 'rollo_entero']);
        });
        Schema::table('orden_venta_rollos', function (Blueprint $table) {
            $table->dropColumn(['metros_rollo', 'entero']);
        });
        Schema::table('orden_venta_detalles', function (Blueprint $table) {
            $table->dropColumn(['modo', 'rollos_pedidos']);
        });
        Schema::table('productos', function (Blueprint $table) {
            $table->dropColumn('metros_por_rollo');
        });
    }
};
