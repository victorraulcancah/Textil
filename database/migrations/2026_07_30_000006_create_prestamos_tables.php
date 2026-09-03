<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prestamos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('almacen_id')->constrained('almacenes');
            $table->foreignId('cliente_id')->nullable()->constrained('clientes')->nullOnDelete();
            $table->dateTime('fecha_prestamo')->nullable();
            $table->date('fecha_devolucion_esperada')->nullable();
            $table->string('estado', 20)->default('pendiente'); // pendiente | prestado | parcial | devuelto
            $table->foreignId('usuario_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('observaciones')->nullable();
            $table->timestamps();
        });

        Schema::create('prestamo_detalles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prestamo_id')->constrained('prestamos')->cascadeOnDelete();
            $table->foreignId('producto_presentacion_id')->nullable()->constrained('producto_presentaciones')->nullOnDelete();
            $table->decimal('cantidad_prestada', 12, 2)->default(0);
            $table->decimal('cantidad_devuelta', 12, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prestamo_detalles');
        Schema::dropIfExists('prestamos');
    }
};
