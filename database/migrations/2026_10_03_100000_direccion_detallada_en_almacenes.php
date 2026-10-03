<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** La dirección del almacén se detalla como la de un cliente: país, departamento, provincia, distrito, ubigeo, código postal y referencia. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('almacenes', function (Blueprint $table) {
            foreach ([
                'referencia' => fn () => $table->string('referencia', 255)->nullable()->after('direccion'),
                'pais' => fn () => $table->string('pais', 80)->nullable()->after('referencia'),
                'departamento' => fn () => $table->string('departamento', 100)->nullable()->after('pais'),
                'provincia' => fn () => $table->string('provincia', 100)->nullable()->after('departamento'),
                'distrito' => fn () => $table->string('distrito', 100)->nullable()->after('provincia'),
                'ubigeo' => fn () => $table->string('ubigeo', 6)->nullable()->after('distrito'),
                'codigo_postal' => fn () => $table->string('codigo_postal', 20)->nullable()->after('ubigeo'),
            ] as $columna => $agregar) {
                if (! Schema::hasColumn('almacenes', $columna)) {
                    $agregar();
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('almacenes', function (Blueprint $table) {
            foreach (['referencia', 'pais', 'departamento', 'provincia', 'distrito', 'ubigeo', 'codigo_postal'] as $columna) {
                if (Schema::hasColumn('almacenes', $columna)) {
                    $table->dropColumn($columna);
                }
            }
        });
    }
};
