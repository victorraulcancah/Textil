<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El traslado pasa a ser un documento formal interno: la Guía de Remisión de
 * traslado entre almacenes. Serie + correlativo, motivo, y datos del
 * transporte (modalidad, transportista, vehículo, conductor, bultos y peso).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transferencias', function (Blueprint $table) {
            // Documento: T001-00000001.
            $table->string('serie', 10)->nullable()->after('id');
            $table->string('numero', 20)->nullable()->after('serie');

            // Motivo de traslado, como en la guía real.
            $table->string('motivo_traslado', 50)->default('traslado_entre_establecimientos')
                ->after('almacen_destino_id');
            $table->date('fecha_inicio_traslado')->nullable()->after('motivo_traslado');

            // Transporte.
            $table->string('modalidad_transporte', 20)->default('privado')->after('fecha_inicio_traslado'); // privado | publico
            $table->string('transportista_razon_social')->nullable()->after('modalidad_transporte');
            $table->string('transportista_ruc', 11)->nullable()->after('transportista_razon_social');
            $table->string('vehiculo_placa', 10)->nullable()->after('transportista_ruc');
            $table->string('conductor_nombre')->nullable()->after('vehiculo_placa');
            $table->string('conductor_documento', 15)->nullable()->after('conductor_nombre');
            $table->string('conductor_licencia', 15)->nullable()->after('conductor_documento');

            // Carga.
            $table->unsignedInteger('numero_bultos')->nullable()->after('conductor_licencia');
            $table->decimal('peso_bruto_kg', 10, 3)->nullable()->after('numero_bultos');
        });
    }

    public function down(): void
    {
        Schema::table('transferencias', function (Blueprint $table) {
            $table->dropColumn([
                'serie', 'numero', 'motivo_traslado', 'fecha_inicio_traslado',
                'modalidad_transporte', 'transportista_razon_social', 'transportista_ruc',
                'vehiculo_placa', 'conductor_nombre', 'conductor_documento', 'conductor_licencia',
                'numero_bultos', 'peso_bruto_kg',
            ]);
        });
    }
};
