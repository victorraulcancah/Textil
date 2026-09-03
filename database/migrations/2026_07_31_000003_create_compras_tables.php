<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Compra = documento del comprobante del proveedor + pagos (solo soles, sin IGV).
 * No mueve stock: el ingreso al almacén se hace en la Recepción.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('compras', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('correlativo')->nullable();   // número interno propio de la compra (auto, desde 1)
            $table->foreignId('proveedor_id')->nullable()->constrained('proveedores')->nullOnDelete();
            $table->foreignId('orden_compra_id')->nullable()->constrained('ordenes_compra')->nullOnDelete();
            $table->string('tipo_documento', 30)->default('factura'); // factura | boleta | guia
            $table->string('serie', 20)->nullable();
            $table->string('numero', 30)->nullable();
            $table->string('guia', 30)->nullable();
            $table->date('fecha');
            $table->string('forma_pago', 20)->default('contado'); // contado | credito
            $table->integer('dias_credito')->default(0);
            $table->date('fecha_vencimiento')->nullable();
            $table->decimal('flete', 12, 2)->default(0);
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->string('estado', 20)->default('registrada'); // registrada | anulada
            $table->text('observaciones')->nullable();
            $table->foreignId('usuario_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('compra_detalles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('compra_id')->constrained('compras')->cascadeOnDelete();
            $table->foreignId('producto_presentacion_id')->nullable()->constrained('producto_presentaciones')->nullOnDelete();
            $table->decimal('cantidad', 12, 2)->default(0);
            $table->decimal('costo_unitario', 12, 2)->default(0);
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->timestamps();
        });

        Schema::create('compra_pagos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('compra_id')->constrained('compras')->cascadeOnDelete();
            $table->string('metodo', 40); // efectivo | transferencia | tarjeta | billetera | ...
            $table->decimal('monto', 12, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('compra_pagos');
        Schema::dropIfExists('compra_detalles');
        Schema::dropIfExists('compras');
    }
};
