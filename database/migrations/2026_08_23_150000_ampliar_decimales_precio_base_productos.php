<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `productos.precio_base` guarda el precio de la unidad base. Con dos decimales
 * cualquier producto que se venda al gramo o al mililitro quedaba en 0.00
 * (S/ 0.0035 el gramo de arroz), y así se mostraba en Existencias.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            $table->decimal('precio_base', 12, 4)->default(0)->change();
        });
    }

    public function down(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            $table->decimal('precio_base', 12, 2)->default(0)->change();
        });
    }
};
