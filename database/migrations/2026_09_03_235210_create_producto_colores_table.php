<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gama de colores de una tela (el muestrario): "Azul Marino - Cód. 402".
 *
 * Por ahora es catálogo: describe en qué colores existe la tela, sin stock
 * propio. Si más adelante se necesita stock por color, esta tabla ya es el
 * lugar al que apuntarían las existencias y los movimientos.
 *
 *  - codigo: el de fábrica o el interno de la tienda (402, PANTONE 19-4052…).
 *  - hex: muestra visual en pantalla (#1F3A93). Opcional.
 *  - imagen: foto del color, para el muestrario. Opcional.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('producto_colores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            $table->string('nombre');
            $table->string('codigo')->nullable();
            $table->string('hex', 9)->nullable();
            $table->string('imagen')->nullable();
            $table->boolean('activo')->default(true);
            $table->timestamps();

            // El nombre identifica al color dentro del producto (igual que las
            // presentaciones): así se puede sincronizar sin borrar y recrear.
            $table->unique(['producto_id', 'nombre']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('producto_colores');
    }
};
