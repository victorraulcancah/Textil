<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('movimientos_inventario', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->nullable()->constrained('productos')->cascadeOnDelete();
            $table->foreignId('producto_variante_id')->nullable()->constrained('producto_variantes')->cascadeOnDelete();
            $table->foreignId('almacen_id')->constrained('almacenes');
            $table->string('tipo_movimiento');
            $table->string('origen');
            $table->string('documento_referencia_tipo')->nullable();
            $table->unsignedBigInteger('documento_referencia_id')->nullable();
            $table->decimal('cantidad', 12, 2);
            $table->decimal('costo_unitario', 12, 2)->default(0);
            $table->decimal('saldo_stock', 12, 2)->default(0);
            $table->timestamp('fecha');
            $table->foreignId('usuario_id')->nullable()->constrained('users');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('movimientos_inventario');
    }
};
