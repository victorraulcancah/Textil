<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tesorería por sucursal: las cuentas por cobrar (de las ventas de cada almacén) y las letras de cambio son de un
 * almacén. Cada sucursal ve y cobra lo suyo. Las cuentas por pagar NO: las compras son de todos los almacenes.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['cuentas_por_cobrar', 'letras_cambio'] as $tabla) {
            if (! Schema::hasColumn($tabla, 'almacen_id')) {
                Schema::table($tabla, function (Blueprint $table) {
                    $table->foreignId('almacen_id')->nullable()->after('id')->constrained('almacenes')->nullOnDelete();
                });
            }
        }

        $primero = DB::table('almacenes')->orderBy('id')->value('id');

        // Las cuentas por cobrar son del almacén de la venta que las originó.
        DB::table('cuentas_por_cobrar')->whereNull('almacen_id')->orderBy('id')->each(function ($c) use ($primero) {
            $almacen = $c->nota_venta_id ? DB::table('notas_venta')->where('id', $c->nota_venta_id)->value('almacen_id') : null;
            DB::table('cuentas_por_cobrar')->where('id', $c->id)->update(['almacen_id' => $almacen ?? $primero]);
        });

        // Una letra sigue a la cuenta de la que se giró; las sueltas, al almacén de quien las emitió.
        DB::table('letras_cambio')->whereNull('almacen_id')->orderBy('id')->each(function ($l) use ($primero) {
            $almacen = $l->cuenta_por_cobrar_id ? DB::table('cuentas_por_cobrar')->where('id', $l->cuenta_por_cobrar_id)->value('almacen_id') : null;
            $almacen ??= $l->usuario_id ? DB::table('users')->where('id', $l->usuario_id)->value('almacen_id') : null;
            DB::table('letras_cambio')->where('id', $l->id)->update(['almacen_id' => $almacen ?? $primero]);
        });
    }

    public function down(): void
    {
        foreach (['cuentas_por_cobrar', 'letras_cambio'] as $tabla) {
            if (Schema::hasColumn($tabla, 'almacen_id')) {
                Schema::table($tabla, fn (Blueprint $table) => $table->dropConstrainedForeignId('almacen_id'));
            }
        }
    }
};
