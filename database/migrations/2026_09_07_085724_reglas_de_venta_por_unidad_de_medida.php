<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Las reglas de venta de cada local se definen con las unidades de medida
 * reales (Metro, Rollo, Yarda, Kilogramo…), no con categorías fijas.
 *
 * Reemplaza el intento anterior:
 *  - almacenes.modalidad_venta ('bulto'|'fraccion'|'ambos')
 *  - producto_presentaciones.tipo_venta (deducido del nombre)
 *
 * Ahora cada almacén marca en qué unidades vende. Sin unidades marcadas vende
 * en todas, que es el comportamiento de siempre.
 *
 * La unidad de cada presentación ya vivía en `unidad_base_id` (así la guarda el
 * formulario de productos), pero el catálogo textil se sembró con "Centímetro"
 * en todas: aquí se corrige a la unidad que le corresponde por su nombre.
 */
return new class extends Migration
{
    /** Palabra en el nombre de la presentación → abreviatura de la unidad. */
    private const POR_NOMBRE = [
        'rollo' => 'rollo',
        'cono' => 'cono',
        'docena' => 'doc',
        'pieza' => 'pza',
        'retazo' => 'retazo',
        'yarda' => 'yd',
        'metro' => 'm',
        'kilogramo' => 'kg',
        'medio kilo' => 'kg',
        'unidad' => 'u',
    ];

    public function up(): void
    {
        // Qué unidades vende cada almacén. Vacío = todas.
        Schema::create('almacen_unidad_venta', function (Blueprint $table) {
            $table->id();
            $table->foreignId('almacen_id')->constrained('almacenes')->cascadeOnDelete();
            $table->foreignId('unidad_medida_id')->constrained('unidades_medida')->cascadeOnDelete();
            $table->unique(['almacen_id', 'unidad_medida_id']);
        });

        $this->corregirUnidadDeLasPresentaciones();
        $this->trasladarConfiguracionAnterior();

        Schema::table('almacenes', fn (Blueprint $t) => $t->dropColumn('modalidad_venta'));
        Schema::table('producto_presentaciones', fn (Blueprint $t) => $t->dropColumn('tipo_venta'));
    }

    public function down(): void
    {
        Schema::table('almacenes', function (Blueprint $table) {
            $table->string('modalidad_venta', 20)->default('ambos')->after('tipo');
        });
        Schema::table('producto_presentaciones', function (Blueprint $table) {
            $table->string('tipo_venta', 20)->default('fraccion')->after('es_venta');
        });

        Schema::dropIfExists('almacen_unidad_venta');
    }

    /**
     * "Rollo 50 m" pasa a apuntar a la unidad Rollo, "Metro (al corte)" a Metro,
     * y así. Solo toca las que quedaron con la unidad base del stock.
     */
    private function corregirUnidadDeLasPresentaciones(): void
    {
        $unidades = DB::table('unidades_medida')->pluck('id', 'abreviatura');

        foreach (DB::table('producto_presentaciones')->get() as $presentacion) {
            $nombre = mb_strtolower($presentacion->nombre);

            foreach (self::POR_NOMBRE as $palabra => $abreviatura) {
                if (! str_contains($nombre, $palabra) || ! isset($unidades[$abreviatura])) {
                    continue;
                }

                DB::table('producto_presentaciones')
                    ->where('id', $presentacion->id)
                    ->update(['unidad_base_id' => $unidades[$abreviatura]]);

                break;
            }
        }
    }

    /** La tienda vendía "solo al corte": pasa a vender en metro, yarda y retazo. */
    private function trasladarConfiguracionAnterior(): void
    {
        if (! Schema::hasColumn('almacenes', 'modalidad_venta')) {
            return;
        }

        $unidades = DB::table('unidades_medida')->pluck('id', 'abreviatura');

        $equivalencias = [
            'fraccion' => ['m', 'yd', 'kg', 'u', 'retazo'],
            'bulto' => ['rollo', 'cono', 'doc', 'pza'],
        ];

        foreach (DB::table('almacenes')->get() as $almacen) {
            $abreviaturas = $equivalencias[$almacen->modalidad_venta] ?? [];

            foreach ($abreviaturas as $abreviatura) {
                if (! isset($unidades[$abreviatura])) {
                    continue;
                }

                DB::table('almacen_unidad_venta')->insertOrIgnore([
                    'almacen_id' => $almacen->id,
                    'unidad_medida_id' => $unidades[$abreviatura],
                ]);
            }
        }
    }
};
