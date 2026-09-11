<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * El color de cada movimiento del kardex.
 *
 * El stock del producto no distingue colores; los rollos sí. Cuando un
 * movimiento nace de rollos concretos (una recepción, una venta que corta un
 * rollo) se sabe de qué color es, y se guarda aquí. Cuando no se sabe —un
 * ajuste, un producto que no va por rollos— queda en null, que es la verdad.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('movimientos_inventario', 'producto_color_id')) {
            Schema::table('movimientos_inventario', function (Blueprint $table) {
                $table->foreignId('producto_color_id')
                    ->nullable()
                    ->after('producto_id')
                    ->constrained('producto_colores')
                    ->nullOnDelete();
            });
        }

        $this->completarRecepciones();
        $this->completarVentas();
    }

    /**
     * Recepciones pasadas: el color sale de los rollos que creó esa recepción
     * para ese producto. Solo se completa si todos son del mismo color; si una
     * recepción trajo dos colores del mismo producto en un solo movimiento, no
     * hay forma honesta de repartirlo y se deja vacío.
     */
    private function completarRecepciones(): void
    {
        $movimientos = DB::table('movimientos_inventario')
            ->where('documento_referencia_tipo', 'recepcion_compra')
            ->whereNull('producto_color_id')
            ->get(['id', 'producto_id', 'documento_referencia_id']);

        foreach ($movimientos as $mov) {
            $colores = DB::table('rollos')
                ->where('recepcion_compra_id', $mov->documento_referencia_id)
                ->where('producto_id', $mov->producto_id)
                ->whereNotNull('producto_color_id')
                ->distinct()
                ->pluck('producto_color_id');

            if ($colores->count() === 1) {
                DB::table('movimientos_inventario')
                    ->where('id', $mov->id)
                    ->update(['producto_color_id' => $colores->first()]);
            }
        }
    }

    /** Ventas pasadas: el color del rollo que quedó enlazado a la línea. */
    private function completarVentas(): void
    {
        $movimientos = DB::table('movimientos_inventario')
            ->where('documento_referencia_tipo', 'nota_venta')
            ->whereNull('producto_color_id')
            ->get(['id', 'producto_id', 'documento_referencia_id']);

        foreach ($movimientos as $mov) {
            $colores = DB::table('nota_venta_detalles as d')
                ->join('producto_presentaciones as p', 'p.id', '=', 'd.producto_presentacion_id')
                ->join('rollos as r', 'r.id', '=', 'd.rollo_id')
                ->where('d.nota_venta_id', $mov->documento_referencia_id)
                ->where('p.producto_id', $mov->producto_id)
                ->whereNotNull('r.producto_color_id')
                ->distinct()
                ->pluck('r.producto_color_id');

            if ($colores->count() === 1) {
                DB::table('movimientos_inventario')
                    ->where('id', $mov->id)
                    ->update(['producto_color_id' => $colores->first()]);
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('movimientos_inventario', 'producto_color_id')) {
            Schema::table('movimientos_inventario', function (Blueprint $table) {
                $table->dropConstrainedForeignId('producto_color_id');
            });
        }
    }
};
