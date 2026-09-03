<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('movimientos_caja', function (Blueprint $table) {
            $table->id();
            $table->foreignId('apertura_caja_id')->constrained('aperturas_caja');
            $table->string('tipo', 10);
            // Nullable: los movimientos que nacen de un documento (venta contado, pago de
            // cuenta por cobrar/pagar) usan forma_pago en el documento, no un metodo_pago_id.
            $table->foreignId('metodo_pago_id')->nullable()->constrained('metodos_pago')->nullOnDelete();
            $table->foreignId('cuenta_bancaria_id')->nullable()->constrained('cuentas_bancarias')->nullOnDelete();
            $table->foreignId('tarjeta_id')->nullable()->constrained('tarjetas_bancarias')->nullOnDelete();
            $table->foreignId('billetera_id')->nullable()->constrained('billeteras_digitales')->nullOnDelete();
            $table->string('numero_operacion', 100)->nullable();
            $table->string('captura_url')->nullable();
            $table->decimal('monto', 12, 2);
            $table->string('documento_referencia_tipo', 50)->nullable();
            $table->unsignedBigInteger('documento_referencia_id')->nullable();
            $table->date('fecha');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('movimientos_caja');
    }
};
