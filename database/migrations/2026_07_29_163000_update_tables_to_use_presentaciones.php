<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private array $tables = [
        'producto_almacen_stock' => ['prod_alm_stock_unique'],
        'movimientos_inventario' => [],
        'solicitud_compra_detalles' => [],
        'orden_compra_detalles' => [],
        'recepcion_compra_detalles' => [],
        'transferencia_detalles' => [],
        'ajuste_detalles' => [],
        'toma_inventario_detalles' => [],
        'devolucion_proveedor_detalles' => [],
    ];

    public function up(): void
    {
        foreach ($this->tables as $table => $uniques) {
            Schema::table($table, function (Blueprint $t) use ($table, $uniques) {
                // Drop old FKs and columns
                $t->dropForeign(['producto_variante_id']);

                // Only drop producto_id FK if the table has it
                // (some tables like producto_almacen_stock also have it)
                if ($this->hasProductoId($table)) {
                    $t->dropForeign(['producto_id']);
                }

                // Drop unique constraints that reference old columns
                foreach ($uniques as $uq) {
                    $t->dropUnique($uq);
                }
            });

            Schema::table($table, function (Blueprint $t) use ($table) {
                // Drop the actual columns
                $t->dropColumn('producto_variante_id');
                if ($this->hasProductoId($table)) {
                    $t->dropColumn('producto_id');
                }

                // Add new column
                $t->foreignId('producto_presentacion_id')
                    ->nullable()
                    ->after('id')
                    ->constrained('producto_presentaciones')
                    ->cascadeOnDelete();
            });

            // Re-add unique constraints
            if ($table === 'producto_almacen_stock') {
                Schema::table($table, function (Blueprint $t) {
                    $t->unique(['producto_presentacion_id', 'almacen_id'], 'prod_alm_stock_unique');
                });
            }
        }
    }

    public function down(): void
    {
        // Reverse order
        $rev = array_reverse(array_keys($this->tables));
        foreach ($rev as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropForeign(['producto_presentacion_id']);
            });
            Schema::table($table, function (Blueprint $t) use ($table) {
                $t->dropColumn('producto_presentacion_id');

                // Restore old columns
                $t->foreignId('producto_variante_id')
                    ->nullable()
                    ->constrained('producto_variantes')
                    ->cascadeOnDelete();

                if ($this->hasProductoId($table)) {
                    $t->foreignId('producto_id')
                        ->nullable()
                        ->constrained('productos')
                        ->cascadeOnDelete();
                }
            });

            if ($table === 'producto_almacen_stock') {
                Schema::table($table, function (Blueprint $t) {
                    $t->unique(
                        ['producto_id', 'producto_variante_id', 'almacen_id'],
                        'prod_alm_stock_unique'
                    );
                });
            }
        }
    }

    private function hasProductoId(string $table): bool
    {
        return true;
    }
};
