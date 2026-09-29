<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Una de las direcciones del cliente es la predeterminada: la que sale en la
 * lista y en los documentos (clientes.direccion). Aparte de si es fiscal o de
 * entrega.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cliente_direcciones', function (Blueprint $table) {
            $table->boolean('predeterminada')->default(false)->after('tipo');
        });

        // Hasta ahora la que salía era la fiscal o, sin fiscal, la primera: esa queda.
        DB::table('cliente_direcciones')->orderBy('id')->get(['id', 'cliente_id', 'tipo'])
            ->groupBy('cliente_id')
            ->each(function ($direcciones) {
                $elegida = $direcciones->firstWhere('tipo', 'fiscal') ?? $direcciones->first();
                DB::table('cliente_direcciones')->where('id', $elegida->id)->update(['predeterminada' => true]);
            });
    }

    public function down(): void
    {
        Schema::table('cliente_direcciones', function (Blueprint $table) {
            $table->dropColumn('predeterminada');
        });
    }
};
