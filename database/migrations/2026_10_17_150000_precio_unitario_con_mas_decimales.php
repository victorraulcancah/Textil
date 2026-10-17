<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El precio unitario de pedidos y proformas guarda todos los decimales que se escriben (hasta 6), no solo 2: con 2, un precio
 * de 6.2169348 se guardaba como 6.22 y el total a cobrar cambiaba. Los importes (subtotal, total) siguen en 2 decimales:
 * son plata y se redondean a céntimos.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['orden_venta_detalles', 'nota_venta_detalles'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->decimal('precio_unitario', 16, 6)->default(0)->change();
            });
        }
    }

    public function down(): void
    {
        foreach (['orden_venta_detalles', 'nota_venta_detalles'] as $tabla) {
            Schema::table($tabla, function (Blueprint $table) {
                $table->decimal('precio_unitario', 12, 2)->default(0)->change();
            });
        }
    }
};
