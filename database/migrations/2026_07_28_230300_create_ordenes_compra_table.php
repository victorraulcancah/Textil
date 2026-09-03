<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ordenes_compra', function (Blueprint $table) {
            $table->id();
            $table->string('codigo')->unique();
            $table->foreignId('proveedor_id')->constrained('proveedores');
            $table->foreignId('solicitud_id')->nullable()->constrained('solicitudes_compra');
            $table->timestamp('fecha_emision');
            $table->timestamp('fecha_entrega_estimada')->nullable();
            $table->string('estado')->default('pendiente');
            $table->foreignId('usuario_crea_id')->constrained('users');
            $table->text('observaciones')->nullable();
            $table->string('condicion_pago')->nullable();
            $table->string('moneda')->default('PEN');
            $table->decimal('tipo_cambio', 10, 4)->default(1);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ordenes_compra');
    }
};
