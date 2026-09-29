<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * El código de tela era "01-familia-tipo" con un "01" fijo que no salía de
 * ninguna tabla. Ahora es "familia-tipo" (01-001) y con el color, "01-001-0001".
 *
 * Se corrigen los productos que tienen ese código generado y los rollos cuyo
 * código empieza con él (el del rollo nace del código de su tela).
 */
return new class extends Migration
{
    public function up(): void
    {
        $tipos = DB::table('tipos_tela')
            ->join('familias_tela', 'familias_tela.id', '=', 'tipos_tela.familia_tela_id')
            ->get(['tipos_tela.id', 'familias_tela.codigo as familia', 'tipos_tela.codigo as tipo'])
            ->keyBy('id');

        foreach (DB::table('productos')->whereNotNull('tipo_tela_id')->get(['id', 'codigo', 'tipo_tela_id']) as $producto) {
            $tipo = $tipos->get($producto->tipo_tela_id);
            if (! $tipo) {
                continue;
            }

            $nuevo = "{$tipo->familia}-{$tipo->tipo}";
            if ($producto->codigo !== "01-{$nuevo}") {
                continue; // ya está bien, o se escribió a mano
            }

            DB::table('productos')->where('id', $producto->id)->update(['codigo' => $nuevo]);

            // Sus rollos: 01-01-001-0001-0006 → 01-001-0001-0006.
            $viejo = $producto->codigo;
            DB::table('rollos')
                ->where('producto_id', $producto->id)
                ->where('codigo', 'like', $viejo.'-%')
                ->update(['codigo' => DB::raw('CONCAT('.DB::getPdo()->quote($nuevo).', SUBSTRING(codigo, '.(strlen($viejo) + 1).'))')]);
        }
    }

    public function down(): void
    {
        // No se revierte: el "01" no significaba nada.
    }
};
