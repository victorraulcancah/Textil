<?php

use App\Models\SerieDocumento;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Una letra que nace de renovar otra lleva además su propia serie de renovación:
 * RV001-001, RV001-002… (con su correlativo aparte del de las letras, LT001-NNN).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            $table->string('serie_renovacion', 20)->nullable()->unique()->after('letra_anterior_id');
        });

        // Las renovaciones que ya existían, en el orden en que se hicieron.
        $n = 0;
        DB::table('letras_cambio')->whereNotNull('letra_anterior_id')->orderBy('id')->pluck('id')->each(function ($id) use (&$n) {
            $n++;
            DB::table('letras_cambio')->where('id', $id)->update(['serie_renovacion' => sprintf('RV001-%03d', $n)]);
        });

        if ($n > 0) {
            SerieDocumento::updateOrCreate(
                ['tipo_documento' => 'letra_renovacion', 'serie' => 'RV001'],
                ['numero_actual' => $n, 'activo' => true],
            );
        }
    }

    public function down(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            $table->dropColumn('serie_renovacion');
        });
    }
};
