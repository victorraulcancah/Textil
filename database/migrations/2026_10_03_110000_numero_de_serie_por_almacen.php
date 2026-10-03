<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cada almacén es una sucursal con su propia numeración: el almacén 1 emite PF01-001, el 2 emite PF02-001…
 * `numero_serie` es ese número (único). Los almacenes que ya existen lo reciben en el orden en que se crearon.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('almacenes', 'numero_serie')) {
            Schema::table('almacenes', function (Blueprint $table) {
                $table->unsignedSmallInteger('numero_serie')->nullable()->unique()->after('codigo');
            });
        }

        $n = 0;
        foreach (DB::table('almacenes')->whereNull('numero_serie')->orderBy('id')->pluck('id') as $id) {
            $n = max($n, (int) DB::table('almacenes')->max('numero_serie')) + 1;
            DB::table('almacenes')->where('id', $id)->update(['numero_serie' => $n]);
        }

        // La proforma PF01 que ya existe pertenece al almacén 1.
        $primero = DB::table('almacenes')->where('numero_serie', 1)->value('id');
        if ($primero) {
            DB::table('series_documento')->where('tipo_documento', 'nota_venta')->where('serie', 'PF01')->whereNull('almacen_id')->update(['almacen_id' => $primero]);
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('almacenes', 'numero_serie')) {
            Schema::table('almacenes', function (Blueprint $table) {
                $table->dropUnique(['numero_serie']);
                $table->dropColumn('numero_serie');
            });
        }
    }
};
