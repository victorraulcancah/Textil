<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producto_presentaciones', function (Blueprint $table) {
            if (! Schema::hasColumn('producto_presentaciones', 'precio_compra')) {
                $table->decimal('precio_compra', 12, 2)->default(0)->after('precio_venta');
            }
            if (! Schema::hasColumn('producto_presentaciones', 'margen')) {
                // % de ganancia sobre el precio de compra (referencial).
                $table->decimal('margen', 7, 2)->default(0)->after('precio_compra');
            }
            if (! Schema::hasColumn('producto_presentaciones', 'producto_complementario_id')) {
                $table->foreignId('producto_complementario_id')->nullable()->after('unidad_base_id')
                    ->constrained('productos')->nullOnDelete();
            }
            if (! Schema::hasColumn('producto_presentaciones', 'cantidad_complementaria')) {
                $table->decimal('cantidad_complementaria', 12, 2)->default(0)->after('producto_complementario_id');
            }
        });

        // Mayor precision para el factor (venta al gramo/fraccion fina): 3 decimales.
        Schema::table('producto_presentaciones', function (Blueprint $table) {
            $table->decimal('factor_conversion', 14, 3)->default(1)->change();
        });
    }

    public function down(): void
    {
        Schema::table('producto_presentaciones', function (Blueprint $table) {
            if (Schema::hasColumn('producto_presentaciones', 'producto_complementario_id')) {
                $table->dropConstrainedForeignId('producto_complementario_id');
            }
            $table->dropColumn(array_filter([
                Schema::hasColumn('producto_presentaciones', 'precio_compra') ? 'precio_compra' : null,
                Schema::hasColumn('producto_presentaciones', 'margen') ? 'margen' : null,
                Schema::hasColumn('producto_presentaciones', 'cantidad_complementaria') ? 'cantidad_complementaria' : null,
            ]));
            $table->decimal('factor_conversion', 12, 2)->default(1)->change();
        });
    }
};
