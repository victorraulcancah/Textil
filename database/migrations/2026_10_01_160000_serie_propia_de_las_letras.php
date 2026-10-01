<?php

use App\Models\SerieDocumento;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * La serie LT001-NNN es solo de las letras de cambio. Una renovación es otro documento y
 * lleva únicamente su serie RV001-NNN: ya no consume un número de LT001. El correlativo de la
 * serie de las letras se guarda aparte del "Letra Nro" (que identifica cada fila).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            $table->string('serie_letra', 20)->nullable()->unique()->after('numero');
        });

        // Las letras que ya existían (las que no son renovaciones), en el orden en que se emitieron.
        $n = 0;
        DB::table('letras_cambio')->whereNull('letra_anterior_id')->orderBy('id')->pluck('id')->each(function ($id) use (&$n) {
            $n++;
            DB::table('letras_cambio')->where('id', $id)->update(['serie_letra' => sprintf('LT001-%03d', $n)]);
        });

        SerieDocumento::updateOrCreate(
            ['tipo_documento' => 'letra_serie', 'serie' => 'LT001'],
            ['numero_actual' => $n, 'activo' => true],
        );
    }

    public function down(): void
    {
        Schema::table('letras_cambio', function (Blueprint $table) {
            $table->dropColumn('serie_letra');
        });
    }
};
