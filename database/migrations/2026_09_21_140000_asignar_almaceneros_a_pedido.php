<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El encargado del almacén reparte los pedidos: cada uno se le asigna a uno o
 * varios almaceneros, que ven "sus" tareas en la bandeja de despacho.
 *
 * Es solo coordinación, no un candado: cualquier almacenero con permiso puede
 * seguir escaneando, así una ausencia no deja un pedido parado hasta que
 * alguien lo reasigne.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orden_venta_asignaciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('orden_venta_id')->constrained('ordenes_venta')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // Quién repartió la tarea: el encargado.
            $table->foreignId('asignado_por_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['orden_venta_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orden_venta_asignaciones');
    }
};
