<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Una sola empresa en uso: su logo y sus datos salen en el menú, el login, el favicon y todos los PDF.
 *
 * Hasta ahora varias empresas podían estar "activas" a la vez y el sistema usaba la de menor id sin que se viera cuál. Aquí
 * queda marcada solo esa (la que ya se estaba usando); si ninguna lo estaba, la primera.
 */
return new class extends Migration
{
    public function up(): void
    {
        $enUso = DB::table('empresas')->where('activa', true)->orderBy('id')->value('id')
            ?? DB::table('empresas')->orderBy('id')->value('id');

        if ($enUso === null) {
            return;
        }

        DB::table('empresas')->where('id', '!=', $enUso)->update(['activa' => false]);
        DB::table('empresas')->where('id', $enUso)->update(['activa' => true]);
    }

    public function down(): void
    {
        // No hay forma de saber cuáles estaban activas antes.
    }
};
