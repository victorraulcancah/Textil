<?php

namespace Database\Seeders;

use App\Models\UnidadMedida;
use Illuminate\Database\Seeder;

/**
 * Catálogo de unidades de medida, y única fuente de verdad de `factor_base`.
 *
 * `factor_base` = cuántas unidades mínimas de su familia vale. Es lo que traduce
 * todo el sistema (stock, kardex, costos), así que un valor mal puesto no da
 * error: simplemente muestra números equivocados en todas partes.
 *
 *   Peso:    gramo = 1        kilogramo = 1000
 *   Volumen: mililitro = 1    litro = 1000       galón = 3785
 *   Pieza:   unidad = 1       docena = 12        ciento = 100
 *   Envases: saco, caja, bolsa, paquete, jaba, blíster = 1
 *
 * Los envases van en 1 a propósito: cuántos kilos trae un saco no es fijo, se
 * define en cada producto con "compro por saco, que trae 50 kilogramos".
 *
 * Es idempotente y CORRIGE los factores de las unidades que ya existan: se
 * puede volver a ejecutar cuando alguien las haya configurado mal.
 *
 *   php artisan db:seed --class=UnidadesMedidaSeeder --force
 */
class UnidadesMedidaSeeder extends Seeder
{
    /** [abreviatura, nombre, factor_base] */
    public const UNIDADES = [
        // Pieza
        ['u', 'Unidad', 1],
        ['doc', 'Docena', 12],
        ['ciento', 'Ciento', 100],

        // Peso
        ['g', 'Gramo', 1],
        ['kg', 'Kilogramo', 1000],
        ['tn', 'Tonelada', 1000000],

        // Volumen
        ['ml', 'Mililitro', 1],
        ['l', 'Litro', 1000],
        ['gal', 'Galón', 3785],

        // Envases: su contenido lo define cada producto, no la unidad.
        ['saco', 'Saco', 1],
        ['caja', 'Caja', 1],
        ['bolsa', 'Bolsa', 1],
        ['pqte', 'Paquete', 1],
        ['jaba', 'Jaba', 1],
        ['blister', 'Blíster', 1],
        ['botella', 'Botella', 1],
        ['lata', 'Lata', 1],
    ];

    public function run(): void
    {
        $creadas = 0;
        $corregidas = 0;

        foreach (self::UNIDADES as [$abrev, $nombre, $factor]) {
            // Se busca por abreviatura y también por nombre: la misma unidad
            // puede estar guardada con otra abreviatura ("Unidad" como `un` en
            // vez de `u`) y crearla otra vez la duplicaría.
            $unidad = UnidadMedida::where('abreviatura', $abrev)
                ->orWhereRaw('LOWER(nombre) = ?', [mb_strtolower($nombre)])
                ->first();

            if (! $unidad) {
                UnidadMedida::create([
                    'nombre' => $nombre,
                    'abreviatura' => $abrev,
                    'factor_base' => $factor,
                ]);
                $creadas++;

                continue;
            }

            if ((float) $unidad->factor_base !== (float) $factor) {
                $this->command?->warn(
                    "  {$unidad->nombre} ({$abrev}): factor {$unidad->factor_base} -> {$factor}"
                );
                $unidad->update(['factor_base' => $factor]);
                $corregidas++;
            }
        }

        $this->command?->info("Unidades: {$creadas} creadas, {$corregidas} corregidas.");

        $this->avisarSospechosas();
    }

    /**
     * Avisa de dos cosas a revisar a mano, sin tocarlas: son datos del usuario
     * y puede haber un motivo detrás.
     *
     *  - Dos unidades con el mismo nombre: al elegir una en un producto no se
     *    distingue cuál es, y pueden tener factores distintos.
     *  - Un envase con factor distinto de 1: su contenido lo define el producto.
     */
    private function avisarSospechosas(): void
    {
        $todas = UnidadMedida::orderBy('id')->get();

        $todas->groupBy(fn ($u) => mb_strtolower(trim($u->nombre)))
            ->filter(fn ($grupo) => $grupo->count() > 1)
            ->each(function ($grupo, $nombre) {
                $detalle = $grupo->map(fn ($u) => "{$u->abreviatura} (factor {$u->factor_base})")
                    ->implode(' y ');
                $this->command?->warn("  Revisar: hay {$grupo->count()} unidades llamadas \"{$nombre}\": {$detalle}.");
            });

        $envases = ['saco', 'caja', 'bolsa', 'paquete', 'jaba', 'blister', 'blíster', 'botella', 'lata'];

        foreach ($todas as $u) {
            $esEnvase = in_array(mb_strtolower(trim($u->nombre)), $envases, true);

            if ($esEnvase && (float) $u->factor_base !== 1.0) {
                $this->command?->warn(
                    "  Revisar: \"{$u->nombre}\" es un envase con factor {$u->factor_base}; "
                    .'debería ser 1 (lo que trae se define en cada producto).'
                );
            }
        }
    }
}
