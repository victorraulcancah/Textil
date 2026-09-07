<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cómo vende cada local.
 *
 * Un almacén mayorista despacha rollos cerrados; una tienda corta metro a
 * metro del mismo rollo. El stock ya se lleva en unidad base (centímetros),
 * así que ambas cosas eran posibles: lo que faltaba era decir qué se puede
 * vender en cada sitio.
 *
 *  - almacenes.modalidad_venta: 'bulto' | 'fraccion' | 'ambos'
 *  - producto_presentaciones.tipo_venta: 'bulto' (rollo, cono, docena, pieza)
 *    o 'fraccion' (metro, yarda, kilo, unidad suelta)
 *
 * Al vender solo se ofrecen las presentaciones que encajan con la modalidad
 * del almacén elegido.
 */
return new class extends Migration
{
    /** Palabras que delatan una presentación por bulto. */
    private const BULTO = ['rollo', 'cono', 'docena', 'pieza', 'caja', 'saco', 'paquete', 'fardo'];

    public function up(): void
    {
        Schema::table('almacenes', function (Blueprint $table) {
            $table->string('modalidad_venta', 20)->default('ambos')->after('tipo');
        });

        Schema::table('producto_presentaciones', function (Blueprint $table) {
            $table->string('tipo_venta', 20)->default('fraccion')->after('es_venta');
        });

        // Las presentaciones que ya existen se clasifican por su nombre; luego
        // se puede corregir a mano desde el formulario del producto.
        foreach (self::BULTO as $palabra) {
            DB::table('producto_presentaciones')
                ->where('nombre', 'like', "%{$palabra}%")
                ->update(['tipo_venta' => 'bulto']);
        }

        // La tienda vende al corte; el almacén principal despacha bultos.
        DB::table('almacenes')->where('tipo', 'tienda')->update(['modalidad_venta' => 'fraccion']);
        DB::table('almacenes')->where('tipo', 'principal')->update(['modalidad_venta' => 'ambos']);
    }

    public function down(): void
    {
        Schema::table('almacenes', function (Blueprint $table) {
            $table->dropColumn('modalidad_venta');
        });

        Schema::table('producto_presentaciones', function (Blueprint $table) {
            $table->dropColumn('tipo_venta');
        });
    }
};
