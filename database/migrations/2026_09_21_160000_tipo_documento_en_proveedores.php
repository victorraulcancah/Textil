<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Con qué documento se identifica un proveedor nacional: RUC, DNI, carné de
 * extranjería o ninguno, igual que en Clientes.
 *
 * El número sigue guardándose en `ruc` (es la columna de siempre); esta dice
 * de qué documento es, para poder elegirlo al editar y consultar el que toca
 * (SUNAT para el RUC, RENIEC para el DNI).
 *
 * Se completa hacia atrás por el largo del número: 11 dígitos es un RUC y 8
 * un DNI. Lo demás queda sin tipo y el formulario lo trata como RUC.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('proveedores', 'tipo_documento')) {
            Schema::table('proveedores', function (Blueprint $table) {
                $table->string('tipo_documento', 10)->nullable()->after('ruc');
            });
        }

        DB::table('proveedores')->where('tipo', 'nacional')->whereRaw('CHAR_LENGTH(ruc) = 11')
            ->update(['tipo_documento' => 'RUC']);
        DB::table('proveedores')->where('tipo', 'nacional')->whereRaw('CHAR_LENGTH(ruc) = 8')
            ->update(['tipo_documento' => 'DNI']);
    }

    public function down(): void
    {
        if (Schema::hasColumn('proveedores', 'tipo_documento')) {
            Schema::table('proveedores', function (Blueprint $table) {
                $table->dropColumn('tipo_documento');
            });
        }
    }
};
