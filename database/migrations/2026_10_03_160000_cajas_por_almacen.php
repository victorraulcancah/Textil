<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tesorería por sucursal: cada caja es de un almacén y se identifica con su código CJ + número del almacén
 * (3 cifras) + correlativo (CJ001-001 = primera caja del almacén 1, CJ002-001 = primera del almacén 2).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cajas', function (Blueprint $table) {
            if (! Schema::hasColumn('cajas', 'almacen_id')) {
                $table->foreignId('almacen_id')->nullable()->after('id')->constrained('almacenes')->nullOnDelete();
                $table->string('codigo', 12)->nullable()->unique()->after('almacen_id');
            }
        });

        // Las cajas que ya existen quedan en el almacén de su usuario (si tienen uno) y reciben su código.
        foreach (DB::table('cajas')->whereNull('almacen_id')->orderBy('id')->get() as $caja) {
            $almacenId = DB::table('users')->where('caja_id', $caja->id)->whereNotNull('almacen_id')->value('almacen_id');
            if (! $almacenId) {
                continue;
            }

            $numero = DB::table('almacenes')->where('id', $almacenId)->value('numero_serie') ?: $almacenId;
            $serie = 'CJ'.str_pad((string) $numero, 3, '0', STR_PAD_LEFT);
            $doc = DB::table('series_documento')->where('tipo_documento', 'caja')->where('serie', $serie)->first();
            $correlativo = ($doc->numero_actual ?? 0) + 1;

            if ($doc) {
                DB::table('series_documento')->where('id', $doc->id)->update(['numero_actual' => $correlativo]);
            } else {
                DB::table('series_documento')->insert([
                    'tipo_documento' => 'caja', 'serie' => $serie, 'numero_actual' => $correlativo,
                    'almacen_id' => $almacenId, 'activo' => true, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            DB::table('cajas')->where('id', $caja->id)->update([
                'almacen_id' => $almacenId,
                'codigo' => $serie.'-'.str_pad((string) $correlativo, 3, '0', STR_PAD_LEFT),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('cajas', function (Blueprint $table) {
            if (Schema::hasColumn('cajas', 'almacen_id')) {
                $table->dropUnique(['codigo']);
                $table->dropConstrainedForeignId('almacen_id');
                $table->dropColumn('codigo');
            }
        });
    }
};
