<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Otros gastos de una compra (seguro, agente de aduana, transporte local…)
 * que se suman al costo de la mercadería. No cambian lo que se le debe al
 * proveedor: son gastos de quien compra, y se reparten entre las líneas en
 * proporción a su valor cuando la mercadería entra al almacén.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('compra_gastos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('compra_id')->constrained('compras')->cascadeOnDelete();
            $table->string('concepto', 100);
            // Lo que se escribió, en su moneda (los gastos de aduana suelen ser en soles).
            $table->decimal('monto_origen', 14, 2);
            $table->string('moneda', 3)->default('PEN');
            // Ese mismo gasto en la moneda de la compra: es el que se reparte.
            $table->decimal('monto', 14, 2);
            // Hay gastos que se registran pero no forman parte del costo.
            $table->boolean('incluye_costo')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('compra_gastos');
    }
};
