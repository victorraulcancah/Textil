<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Una orden anulada suelta su código (OCE-006) y su número de proveedor (003) para que la siguiente
 * orden los use y el correlativo no tenga huecos. Se guarda cuál tenía en `codigo_anulado`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ordenes_compra', function (Blueprint $table) {
            $table->string('codigo')->nullable()->change();
            $table->string('codigo_anulado', 60)->nullable()->after('codigo');
        });

        // Las que ya estaban anuladas también sueltan sus códigos.
        DB::table('ordenes_compra')->where('estado', 'anulada')->whereNotNull('codigo')->update([
            'codigo_anulado' => DB::raw('codigo'),
            'codigo' => null,
            'numero_proveedor' => null,
        ]);
    }

    public function down(): void
    {
        DB::table('ordenes_compra')->whereNull('codigo')->update(['codigo' => DB::raw("COALESCE(codigo_anulado, CONCAT('ANU-', id))")]);

        Schema::table('ordenes_compra', function (Blueprint $table) {
            $table->dropColumn('codigo_anulado');
            $table->string('codigo')->nullable(false)->change();
        });
    }
};
