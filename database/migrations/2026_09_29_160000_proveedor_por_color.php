<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * El proveedor va por color, no por tela: cada color del muestrario lo trae un
 * proveedor registrado (el mismo o distinto). Lo que la tela tenía como
 * proveedor pasa a cada uno de sus colores como punto de partida.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producto_colores', function (Blueprint $table) {
            $table->foreignId('proveedor_id')->nullable()->after('nombre_proveedor')
                ->constrained('proveedores')->nullOnDelete();
        });

        // El principal de la tela (o el primero que tenga) para cada color que aún no tiene.
        $proveedorDeTela = DB::table('producto_proveedor')
            ->orderByDesc('principal')
            ->orderBy('id')
            ->get(['producto_id', 'proveedor_id'])
            ->unique('producto_id')
            ->pluck('proveedor_id', 'producto_id');

        foreach ($proveedorDeTela as $productoId => $proveedorId) {
            DB::table('producto_colores')
                ->where('producto_id', $productoId)
                ->whereNull('proveedor_id')
                ->update(['proveedor_id' => $proveedorId]);
        }
    }

    public function down(): void
    {
        Schema::table('producto_colores', function (Blueprint $table) {
            $table->dropConstrainedForeignId('proveedor_id');
        });
    }
};
