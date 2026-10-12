<?php

/**
 * Deja UNA sola unidad Metro, con abreviatura `m` (así el sistema reconoce una tela), y que exista Rollo.
 *
 * Une las que estén repetidas o mal escritas ("METROS" / "MT" / "mts" / "Metro"): pasa todo lo que las usa
 * (productos, presentaciones, reglas de venta de los almacenes) a la que se queda y borra las sobrantes.
 *
 * Por defecto solo MUESTRA lo que haría y no toca nada. Para aplicarlo:
 *
 *   php artisan tinker --execute="require base_path('database/scripts/unificar_metro.php');"
 *   APLICAR=1 php artisan tinker --execute="require base_path('database/scripts/unificar_metro.php');"
 */

use Illuminate\Support\Facades\DB;

$aplicar = filter_var(getenv('APLICAR'), FILTER_VALIDATE_BOOLEAN);

// Las columnas que apuntan a una unidad de medida (de las llaves foráneas, así no se queda ninguna).
$usos = collect(DB::select(
    'select table_name as tabla, column_name as columna from information_schema.key_column_usage
     where table_schema = database() and referenced_table_name = ?',
    ['unidades_medida'],
));

$usosDe = fn ($id) => $usos->sum(fn ($u) => DB::table($u->tabla)->where($u->columna, $id)->count());

$metros = DB::table('unidades_medida')
    ->whereRaw('LOWER(abreviatura) in (?, ?, ?)', ['m', 'mt', 'mts'])
    ->orWhereRaw('LOWER(nombre) in (?, ?)', ['metro', 'metros'])
    ->orderBy('id')
    ->get();

echo ($aplicar ? 'APLICANDO' : 'SIMULACION (no se toca nada; usa APLICAR=1 para aplicar)'), PHP_EOL, PHP_EOL;

DB::beginTransaction();

try {
    if ($metros->isEmpty()) {
        $id = DB::table('unidades_medida')->insertGetId([
            'nombre' => 'Metro', 'abreviatura' => 'm', 'factor_base' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        echo "No había ninguna: se crea Metro (m) con id {$id}.", PHP_EOL;
    } else {
        echo 'Unidades de metro encontradas:', PHP_EOL;
        foreach ($metros as $u) {
            echo "  id {$u->id}  {$u->nombre}  [{$u->abreviatura}]  factor {$u->factor_base}  · usada {$usosDe($u->id)} vez/veces", PHP_EOL;
        }

        // La que se queda: la que ya es "m"; si no, la más usada; si no, la primera.
        $queda = $metros->first(fn ($u) => $u->abreviatura === 'm')
            ?? $metros->sortByDesc(fn ($u) => $usosDe($u->id))->first();
        echo PHP_EOL, "Se queda: id {$queda->id} ({$queda->nombre}).", PHP_EOL;

        foreach ($metros->where('id', '!=', $queda->id) as $sobra) {
            foreach ($usos as $u) {
                $n = DB::table($u->tabla)->where($u->columna, $sobra->id)->count();
                if ($n === 0) {
                    continue;
                }
                // Una regla de venta repetida (mismo almacén y unidad) no se puede duplicar: se descarta la sobrante.
                DB::update("update ignore `{$u->tabla}` set `{$u->columna}` = ? where `{$u->columna}` = ?", [$queda->id, $sobra->id]);
                DB::table($u->tabla)->where($u->columna, $sobra->id)->delete();
                echo "  {$u->tabla}.{$u->columna}: {$n} fila(s) pasan a id {$queda->id}", PHP_EOL;
            }
            DB::table('unidades_medida')->where('id', $sobra->id)->delete();
            echo "  se borra id {$sobra->id} ({$sobra->nombre})", PHP_EOL;
        }

        if ($queda->abreviatura !== 'm') {
            DB::table('unidades_medida')->where('id', $queda->id)->update(['abreviatura' => 'm', 'updated_at' => now()]);
            echo "  id {$queda->id}: abreviatura {$queda->abreviatura} -> m", PHP_EOL;
        }
    }

    $hayRollo = DB::table('unidades_medida')
        ->whereRaw('LOWER(abreviatura) = ?', ['rll'])
        ->orWhereRaw('LOWER(nombre) in (?, ?)', ['rollo', 'rollos'])
        ->exists();
    if (! $hayRollo) {
        DB::table('unidades_medida')->insert([
            'nombre' => 'Rollo', 'abreviatura' => 'RLL', 'factor_base' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        echo '  se crea Rollo (RLL)', PHP_EOL;
    }

    $aplicar ? DB::commit() : DB::rollBack();
} catch (Throwable $e) {
    DB::rollBack();
    echo 'ERROR, no se cambió nada: ', $e->getMessage(), PHP_EOL;
    return;
}

echo PHP_EOL, $aplicar ? 'Listo.' : 'Simulación terminada: no se cambió nada.', PHP_EOL;
