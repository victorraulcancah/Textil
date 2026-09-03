<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notas_venta', function (Blueprint $table) {
            $table->id();
            $table->string('serie');
            $table->string('numero');
            $table->foreignId('cliente_id')->nullable()->constrained('clientes')->nullOnDelete();
            $table->foreignId('almacen_id')->constrained('almacenes');
            $table->foreignId('vendedor_id')->constrained('users');
            $table->date('fecha_emision');
            $table->string('moneda', 10)->default('PEN');
            $table->string('tipo_pago', 20)->default('contado');
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('descuento_total', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->string('estado', 20)->default('emitida');
            $table->text('motivo_anulacion')->nullable();
            $table->foreignId('usuario_anula_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('fecha_anulacion')->nullable();
            $table->text('observaciones')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notas_venta');
    }
};
