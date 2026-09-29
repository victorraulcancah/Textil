<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * El código de una tela es familia (2) - tipo (2) - color (3): 01-01-001.
 *
 * Antes el tipo llevaba 3 dígitos (001) y el color 4 (0001). Se pasan a 2 y 3
 * quitando el cero de más (solo si el código empieza con cero: uno que no se
 * puede acortar se deja). Con ellos se corrigen los códigos que ya salieron de
 * esos: los productos con tipo de tela y los rollos.
 */
return new class extends Migration
{
    private function acortar(string $codigo, int $largo): string
    {
        return strlen($codigo) > $largo && str_starts_with($codigo, '0') && ctype_digit($codigo)
            ? substr($codigo, -$largo)
            : $codigo;
    }

    public function up(): void
    {
        $tipos = DB::table('tipos_tela')->get(['id', 'codigo'])->keyBy('id');
        $colores = DB::table('colores')->get(['id', 'codigo'])->keyBy('id');
        $productoColores = DB::table('producto_colores')->get(['id', 'producto_id', 'color_id', 'codigo']);
        $productos = DB::table('productos')->get(['id', 'codigo', 'tipo_tela_id'])->keyBy('id');
        $familias = DB::table('tipos_tela')
            ->join('familias_tela', 'familias_tela.id', '=', 'tipos_tela.familia_tela_id')
            ->pluck('familias_tela.codigo', 'tipos_tela.id');

        // Los códigos de antes de tocar nada, para reescribir lo que nació de ellos.
        $productoViejo = $productos->map(fn ($p) => $p->codigo);

        foreach ($tipos as $t) {
            DB::table('tipos_tela')->where('id', $t->id)->update(['codigo' => $this->acortar($t->codigo, 2)]);
        }
        foreach ($colores as $c) {
            DB::table('colores')->where('id', $c->id)->update(['codigo' => $this->acortar($c->codigo, 3)]);
        }
        foreach ($productoColores as $pc) {
            if ($pc->codigo !== null) {
                DB::table('producto_colores')->where('id', $pc->id)->update(['codigo' => $this->acortar($pc->codigo, 3)]);
            }
        }

        // Productos con tipo de tela: su código es familia-tipo.
        $productoNuevo = [];
        foreach ($productos as $p) {
            $nuevo = $p->codigo;
            if ($p->tipo_tela_id && isset($familias[$p->tipo_tela_id]) && isset($tipos[$p->tipo_tela_id])) {
                $tipoViejo = $tipos[$p->tipo_tela_id]->codigo;
                $generadoViejo = $familias[$p->tipo_tela_id].'-'.$tipoViejo;
                if ($p->codigo === $generadoViejo) {
                    $nuevo = $familias[$p->tipo_tela_id].'-'.$this->acortar($tipoViejo, 2);
                    DB::table('productos')->where('id', $p->id)->update(['codigo' => $nuevo]);
                }
            }
            $productoNuevo[$p->id] = $nuevo;
        }

        // Sus rollos: 01-001-0005-0001 → 01-01-005-0001 (el número final no cambia).
        foreach ($productoColores as $pc) {
            $viejo = $productoViejo[$pc->producto_id].'-'.$pc->codigo;
            $nuevo = $productoNuevo[$pc->producto_id].'-'.$this->acortar((string) $pc->codigo, 3);
            if ($viejo === $nuevo) {
                continue;
            }

            DB::table('rollos')
                ->where('producto_id', $pc->producto_id)
                ->where('producto_color_id', $pc->id)
                ->where('codigo', 'like', $viejo.'-%')
                ->update(['codigo' => DB::raw('CONCAT('.DB::getPdo()->quote($nuevo).', SUBSTRING(codigo, '.(strlen($viejo) + 1).'))')]);
        }
    }

    public function down(): void
    {
        // No se revierte.
    }
};
