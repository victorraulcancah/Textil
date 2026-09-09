<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * El estado "separada" del pedido pasa a llamarse "pendiente".
 *
 * El nombre viejo describía lo que les pasaba a los rollos, no en qué punto
 * del trabajo estaba el pedido. Visto desde el almacén —que es quien lo mira
 * en su bandeja— lo que hay es un pedido pendiente de preparar.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('ordenes_venta')
            ->where('estado', 'separada')
            ->update(['estado' => 'pendiente']);
    }

    public function down(): void
    {
        DB::table('ordenes_venta')
            ->where('estado', 'pendiente')
            ->update(['estado' => 'separada']);
    }
};
