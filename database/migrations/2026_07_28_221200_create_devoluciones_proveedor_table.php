<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('devoluciones_proveedor', function (Blueprint $table) {
            $table->id();
            $table->foreignId('recepcion_compra_id')->constrained('recepciones_compra');
            $table->unsignedBigInteger('proveedor_id')->nullable();
            $table->foreignId('almacen_id')->constrained('almacenes');
            $table->string('motivo');
            $table->string('estado')->default('pendiente_reemplazo');
            $table->timestamp('fecha');
            $table->text('observaciones')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('devoluciones_proveedor');
    }
};
