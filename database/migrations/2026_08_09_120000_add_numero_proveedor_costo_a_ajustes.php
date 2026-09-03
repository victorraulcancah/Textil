<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ajustes_inventario', function (Blueprint $table) {
            // Correlativo formal del documento, ej. AJ01-0001.
            $table->string('serie', 10)->nullable()->after('id');
            $table->string('numero', 20)->nullable()->after('serie');
            // De quién vino la mercadería, cuando aplica (entradas).
            $table->foreignId('proveedor_id')->nullable()->after('almacen_id')
                ->constrained('proveedores')->nullOnDelete();
            // Valorización del ajuste = suma de cantidad x costo de cada línea.
            $table->decimal('total', 14, 2)->default(0)->after('observaciones');
        });

        Schema::table('ajuste_detalles', function (Blueprint $table) {
            // Costo unitario congelado al momento del ajuste (no es precio de venta).
            $table->decimal('costo_unitario', 12, 4)->default(0)->after('cantidad');
            $table->decimal('subtotal', 14, 2)->default(0)->after('costo_unitario');
        });
    }

    public function down(): void
    {
        Schema::table('ajuste_detalles', function (Blueprint $table) {
            $table->dropColumn(['costo_unitario', 'subtotal']);
        });

        Schema::table('ajustes_inventario', function (Blueprint $table) {
            $table->dropForeign(['proveedor_id']);
            $table->dropColumn(['serie', 'numero', 'proveedor_id', 'total']);
        });
    }
};
