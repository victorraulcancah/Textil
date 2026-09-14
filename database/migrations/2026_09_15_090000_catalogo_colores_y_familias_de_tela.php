<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Catálogo compartido de colores y de familia/tipo de tela: hoy cada
 * producto crea su propio color suelto y cada código de producto se
 * escribe a mano o con un correlativo genérico, así que "Camello" puede
 * terminar con un código distinto en cada tela. Con esto, el color se
 * crea una sola vez y el código de una tela sale de su familia + tipo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('colores', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 4)->unique();
            $table->string('nombre', 100);
            $table->string('hex', 7)->nullable();
            $table->boolean('activo')->default(true);
            $table->timestamps();
        });

        Schema::create('familias_tela', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 2)->unique();
            $table->string('nombre', 100);
            $table->boolean('activo')->default(true);
            $table->timestamps();
        });

        Schema::create('tipos_tela', function (Blueprint $table) {
            $table->id();
            $table->foreignId('familia_tela_id')->constrained('familias_tela')->cascadeOnDelete();
            $table->string('codigo', 3);
            $table->string('nombre', 150);
            $table->boolean('activo')->default(true);
            $table->timestamps();
            $table->unique(['familia_tela_id', 'codigo']);
        });

        Schema::table('productos', function (Blueprint $table) {
            // Solo aplica a telas: el resto de categorías (mercería, etc.)
            // sigue con el correlativo PROD### de siempre.
            $table->foreignId('tipo_tela_id')->nullable()->after('sub_categoria_id')
                ->constrained('tipos_tela')->nullOnDelete();
        });

        Schema::table('producto_colores', function (Blueprint $table) {
            // Nullable y sin tocar 'nombre'/'codigo': lo existente se queda
            // como texto libre; solo lo nuevo se ata al catálogo compartido.
            $table->foreignId('color_id')->nullable()->after('producto_id')
                ->constrained('colores')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('producto_colores', function (Blueprint $table) {
            $table->dropConstrainedForeignId('color_id');
        });

        Schema::table('productos', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tipo_tela_id');
        });

        Schema::dropIfExists('tipos_tela');
        Schema::dropIfExists('familias_tela');
        Schema::dropIfExists('colores');
    }
};
