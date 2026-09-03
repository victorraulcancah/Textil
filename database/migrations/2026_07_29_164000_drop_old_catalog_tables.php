<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('producto_variante_atributo_valor');
        Schema::dropIfExists('atributo_valores');
        Schema::dropIfExists('atributos');
        Schema::dropIfExists('producto_variantes');
        Schema::dropIfExists('sub_categorias');
        Schema::dropIfExists('producto_imagenes');
    }

    public function down(): void
    {
        // No restoration of dropped tables — they were replaced by producto_presentaciones
    }
};
