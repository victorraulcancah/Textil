<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Los sub estados de una letra son tres: en cartera, cobranza libre - banco y letras
 * en descuento - bancos. Lo que se hubiera marcado "cobranza banco" pasa a cobranza libre - banco.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('letras_cambio')->where('sub_estado', 'cobranza_banco')->update(['sub_estado' => 'cobranza_libre']);
    }

    public function down(): void
    {
        // Sin vuelta: no se sabe cuáles eran "cobranza banco".
    }
};
