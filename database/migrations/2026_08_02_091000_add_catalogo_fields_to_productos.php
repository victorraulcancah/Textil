<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            // Subcategoria = categoria hija (categorias es un arbol via categoria_padre_id).
            if (! Schema::hasColumn('productos', 'sub_categoria_id')) {
                $table->foreignId('sub_categoria_id')->nullable()->after('categoria_id')
                    ->constrained('categorias')->nullOnDelete();
            }
            if (! Schema::hasColumn('productos', 'codigo_barras')) {
                $table->string('codigo_barras')->nullable()->after('codigo');
            }
            if (! Schema::hasColumn('productos', 'descripcion_ticket')) {
                $table->string('descripcion_ticket')->nullable()->after('nombre');
            }
            if (! Schema::hasColumn('productos', 'ficha_tecnica')) {
                $table->string('ficha_tecnica')->nullable()->after('imagen');
            }
            if (! Schema::hasColumn('productos', 'accion_tecnica')) {
                $table->text('accion_tecnica')->nullable()->after('ficha_tecnica');
            }
            if (! Schema::hasColumn('productos', 'stock_minimo')) {
                $table->decimal('stock_minimo', 12, 2)->default(0)->after('precio_base');
            }
            if (! Schema::hasColumn('productos', 'stock_maximo')) {
                $table->decimal('stock_maximo', 12, 2)->default(0)->after('stock_minimo');
            }
        });

        // La marca pasa a ser opcional (abarrotes: no todo producto tiene marca).
        Schema::table('productos', function (Blueprint $table) {
            $table->foreignId('marca_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            if (Schema::hasColumn('productos', 'sub_categoria_id')) {
                $table->dropConstrainedForeignId('sub_categoria_id');
            }
            $table->dropColumn(array_filter([
                Schema::hasColumn('productos', 'codigo_barras') ? 'codigo_barras' : null,
                Schema::hasColumn('productos', 'descripcion_ticket') ? 'descripcion_ticket' : null,
                Schema::hasColumn('productos', 'ficha_tecnica') ? 'ficha_tecnica' : null,
                Schema::hasColumn('productos', 'accion_tecnica') ? 'accion_tecnica' : null,
                Schema::hasColumn('productos', 'stock_minimo') ? 'stock_minimo' : null,
                Schema::hasColumn('productos', 'stock_maximo') ? 'stock_maximo' : null,
            ]));
        });
    }
};
