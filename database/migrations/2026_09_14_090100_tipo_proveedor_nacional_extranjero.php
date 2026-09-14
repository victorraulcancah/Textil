<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Si el proveedor es nacional o extranjero. De eso depende qué campos pide
 * el formulario: un nacional se identifica por RUC, uno extranjero por Tax
 * ID (y no siempre tiene fax ni país distinto).
 *
 * Se completa hacia atrás con el RUC: quien ya tiene un RUC de 11 dígitos es
 * nacional, y el resto queda nacional por defecto (es lo que ya eran todos
 * los proveedores antes de esto).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('proveedores', 'tipo')) {
            Schema::table('proveedores', function (Blueprint $table) {
                $table->string('tipo', 20)->default('nacional')->after('codigo_corto');
            });
        }

        DB::table('proveedores')
            ->whereNotNull('tax_id')
            ->whereNull('ruc')
            ->update(['tipo' => 'extranjero']);
    }

    public function down(): void
    {
        if (Schema::hasColumn('proveedores', 'tipo')) {
            Schema::table('proveedores', function (Blueprint $table) {
                $table->dropColumn('tipo');
            });
        }
    }
};
