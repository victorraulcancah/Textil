<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dos cosas del proveedor exterior:
 *
 *   - El código corto (3 caracteres) con el que el cliente arma su propia
 *     numeración: KET-001-26. Es distinto del `codigo` interno (PROV001),
 *     que se sigue usando en el catálogo y las presentaciones.
 *   - Los datos propios de una compra al exterior: incoterm, puerto, naviera,
 *     contenedor. Una orden nacional no los necesita, por eso van todos
 *     nullable y solo se piden cuando `tipo = exterior`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('proveedores', 'codigo_corto')) {
            Schema::table('proveedores', function (Blueprint $table) {
                $table->string('codigo_corto', 3)->nullable()->unique()->after('codigo');
            });
        }

        if (! Schema::hasColumn('ordenes_compra', 'tipo')) {
            Schema::table('ordenes_compra', function (Blueprint $table) {
                $table->string('tipo', 20)->default('nacional')->after('codigo');
                $table->string('incoterm', 20)->nullable()->after('tipo');
                $table->string('puerto_embarque', 100)->nullable()->after('incoterm');
                $table->string('puerto_destino', 100)->nullable()->after('puerto_embarque');
                $table->string('naviera', 100)->nullable()->after('puerto_destino');
                $table->string('numero_contenedor', 50)->nullable()->after('naviera');
                $table->date('fecha_embarque_estimada')->nullable()->after('numero_contenedor');
                $table->unsignedSmallInteger('dias_transito')->nullable()->after('fecha_embarque_estimada');
                $table->string('agente_aduana', 100)->nullable()->after('dias_transito');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('ordenes_compra', 'tipo')) {
            Schema::table('ordenes_compra', function (Blueprint $table) {
                $table->dropColumn([
                    'tipo', 'incoterm', 'puerto_embarque', 'puerto_destino',
                    'naviera', 'numero_contenedor', 'fecha_embarque_estimada',
                    'dias_transito', 'agente_aduana',
                ]);
            });
        }

        if (Schema::hasColumn('proveedores', 'codigo_corto')) {
            Schema::table('proveedores', function (Blueprint $table) {
                $table->dropColumn('codigo_corto');
            });
        }
    }
};
