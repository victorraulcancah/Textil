<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Corrige el diseño de Préstamos para que coincida con la lógica real
 * (proyecto de referencia): bidireccional (presté / me prestaron), tercero
 * como texto libre (no un cliente registrado), estado calculado por el
 * sistema (no elegido a mano), y devoluciones como registros independientes
 * para soportar devoluciones parciales en varios pasos con historial.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prestamos', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cliente_id');
            $table->string('tipo', 20)->default('prestado')->after('almacen_id'); // prestado | recibido
            $table->string('tercero')->nullable()->after('tipo');
        });

        Schema::table('prestamo_detalles', function (Blueprint $table) {
            $table->dropColumn('cantidad_devuelta');
        });

        Schema::create('prestamo_devoluciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prestamo_id')->constrained('prestamos')->cascadeOnDelete();
            $table->foreignId('producto_presentacion_id')->nullable()->constrained('producto_presentaciones')->nullOnDelete();
            $table->decimal('cantidad', 12, 2);
            $table->dateTime('fecha');
            $table->foreignId('usuario_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prestamo_devoluciones');

        Schema::table('prestamo_detalles', function (Blueprint $table) {
            $table->decimal('cantidad_devuelta', 12, 2)->default(0);
        });

        Schema::table('prestamos', function (Blueprint $table) {
            $table->dropColumn(['tipo', 'tercero']);
            $table->foreignId('cliente_id')->nullable()->constrained('clientes')->nullOnDelete();
        });
    }
};
