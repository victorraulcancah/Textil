<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tesorería por sucursal: las cuentas bancarias y las billeteras digitales son de un almacén (las tarjetas siguen a
 * su cuenta). Los bancos son un catálogo y quedan compartidos.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['cuentas_bancarias', 'billeteras_digitales'] as $tabla) {
            if (! Schema::hasColumn($tabla, 'almacen_id')) {
                Schema::table($tabla, function (Blueprint $table) {
                    $table->foreignId('almacen_id')->nullable()->after('id')->constrained('almacenes')->nullOnDelete();
                });
            }
        }

        $primero = DB::table('almacenes')->orderBy('id')->value('id');

        // Lo que ya existe queda en el almacén de la caja que lo usa; si ninguna lo usa, en el primer almacén.
        $deCaja = fn (string $pivote, string $columna, int $id) => DB::table($pivote)
            ->join('cajas', 'cajas.id', '=', "$pivote.caja_id")
            ->where("$pivote.$columna", $id)->whereNotNull('cajas.almacen_id')->value('cajas.almacen_id');

        foreach (DB::table('cuentas_bancarias')->whereNull('almacen_id')->get() as $c) {
            $almacen = $deCaja('caja_cuenta_bancaria', 'cuenta_bancaria_id', $c->id) ?? $primero;
            DB::table('cuentas_bancarias')->where('id', $c->id)->update(['almacen_id' => $almacen]);
        }

        foreach (DB::table('billeteras_digitales')->whereNull('almacen_id')->get() as $b) {
            $almacen = $deCaja('caja_billetera', 'billetera_id', $b->id)
                ?? ($b->cuenta_bancaria_id ? DB::table('cuentas_bancarias')->where('id', $b->cuenta_bancaria_id)->value('almacen_id') : null)
                ?? $primero;
            DB::table('billeteras_digitales')->where('id', $b->id)->update(['almacen_id' => $almacen]);
        }
    }

    public function down(): void
    {
        foreach (['cuentas_bancarias', 'billeteras_digitales'] as $tabla) {
            if (Schema::hasColumn($tabla, 'almacen_id')) {
                Schema::table($tabla, fn (Blueprint $table) => $table->dropConstrainedForeignId('almacen_id'));
            }
        }
    }
};
