<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Datos que el negocio necesita del proveedor y que no estaban.
 *
 *  - proveedor_id: quién fabrica la tela. Sin esto, para recomprar hay que ir
 *    a buscar la compra vieja.
 *
 *  - peso_por_metro: el packing list pesa cada rollo (58 m ≈ 26 kg). Guardar
 *    la equivalencia permite detectar un metraje mal tecleado —si el peso no
 *    cuadra, hay error— y vender por kilo si alguna vez hace falta.
 *
 *  - producto_colores.nombre_proveedor: el proveedor nombra los colores a su
 *    manera ("Verde oscuro (Ha Qing)") y la tienda a la suya ("ANTIQUE"). Sin
 *    los dos nombres, al llegar el siguiente contenedor nadie sabe que son el
 *    mismo color.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            $table->foreignId('proveedor_id')
                ->nullable()
                ->after('sub_marca_id')
                ->constrained('proveedores')
                ->nullOnDelete();

            $table->decimal('peso_por_metro', 10, 4)->nullable()->after('gramaje');
        });

        Schema::table('producto_colores', function (Blueprint $table) {
            $table->string('nombre_proveedor')->nullable()->after('nombre');
        });
    }

    public function down(): void
    {
        Schema::table('producto_colores', function (Blueprint $table) {
            $table->dropColumn('nombre_proveedor');
        });

        Schema::table('productos', function (Blueprint $table) {
            $table->dropConstrainedForeignId('proveedor_id');
            $table->dropColumn('peso_por_metro');
        });
    }
};
