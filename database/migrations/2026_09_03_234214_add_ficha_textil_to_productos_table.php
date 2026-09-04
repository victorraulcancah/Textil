<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ficha técnica de tela. Todo nullable: un producto que no es tela (mercería,
 * hilos, avíos) simplemente deja estos campos vacíos.
 *
 *  - ancho_cm: el ancho útil del rollo, fijo de fábrica (110, 150, 280…).
 *    Va en centímetros para no arrastrar decimales.
 *  - gramaje: g/m² (gsm). Dice si la tela es liviana, media o pesada.
 *  - tipo_tejido: 'plano' (rígido) o 'punto' (con elasticidad).
 *  - elasticidad: 'ninguna' | 'mono' (estira a lo ancho) | 'bi' (a lo ancho y largo).
 *  - encogimiento: % estimado al primer lavado, para avisar cuánto extra comprar.
 *  - minimo_compra: MOQ en la unidad de venta del producto (ej. 5 metros).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            $table->string('composicion')->nullable()->after('descripcion');
            $table->decimal('ancho_cm', 8, 2)->nullable()->after('composicion');
            $table->decimal('gramaje', 8, 2)->nullable()->after('ancho_cm');
            $table->string('tipo_tejido', 20)->nullable()->after('gramaje');
            $table->string('elasticidad', 20)->nullable()->after('tipo_tejido');
            $table->decimal('encogimiento', 5, 2)->nullable()->after('elasticidad');
            $table->decimal('minimo_compra', 12, 2)->nullable()->after('encogimiento');
            $table->text('usos')->nullable()->after('minimo_compra');
            $table->text('propiedades')->nullable()->after('usos');
            $table->text('cuidados')->nullable()->after('propiedades');
        });
    }

    public function down(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            $table->dropColumn([
                'composicion', 'ancho_cm', 'gramaje', 'tipo_tejido', 'elasticidad',
                'encogimiento', 'minimo_compra', 'usos', 'propiedades', 'cuidados',
            ]);
        });
    }
};
