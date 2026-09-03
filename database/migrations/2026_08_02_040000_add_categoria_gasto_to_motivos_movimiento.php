<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('motivos_movimiento', function (Blueprint $table) {
            // Clasificación para el reporte de utilidades:
            //  operativo    → gasto real del negocio (alquiler, sueldos, luz…) → resta en la utilidad neta
            //  compra       → pago a proveedor (ya está en el costo, NO se resta otra vez)
            //  no_operativo → otros egresos que no afectan la utilidad operativa
            $table->string('categoria_gasto', 20)->nullable()->after('ambito');
        });
    }

    public function down(): void
    {
        Schema::table('motivos_movimiento', function (Blueprint $table) {
            $table->dropColumn('categoria_gasto');
        });
    }
};
