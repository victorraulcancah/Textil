<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Historial de cada rollo: quién lo tocó, cuándo y con qué documento.
 *
 * Es la trazabilidad que pide el cliente: al escanear un rollo se puede ver
 * todo su recorrido, desde que entró con la importación hasta que se vendió.
 *
 * Va aparte de movimientos_inventario porque aquel mueve cantidades de un
 * producto y este sigue la vida de una pieza concreta, incluyendo cambios
 * que no mueven stock (separar, cancelar, trasladar de rack).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rollo_movimientos', function (Blueprint $table) {
            $table->id();

            $table->foreignId('rollo_id')->constrained('rollos')->cascadeOnDelete();

            // ingreso, separacion, cancelacion, preparacion, despacho, venta,
            // corte, traslado, ajuste.
            $table->string('tipo', 20);

            // Metros que movió (negativo si salieron). Cero en los cambios que
            // solo cambian de estado o de ubicación.
            $table->decimal('metros', 12, 2)->default(0);
            $table->decimal('metros_antes', 12, 2)->default(0);
            $table->decimal('metros_despues', 12, 2)->default(0);

            $table->string('estado_antes', 20)->nullable();
            $table->string('estado_despues', 20)->nullable();

            // Documento que originó el movimiento, si lo hubo.
            $table->string('documento_tipo', 40)->nullable();
            $table->unsignedBigInteger('documento_id')->nullable();

            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('observacion')->nullable();
            $table->timestamps();

            $table->index(['rollo_id', 'created_at']);
            $table->index(['documento_tipo', 'documento_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rollo_movimientos');
    }
};
