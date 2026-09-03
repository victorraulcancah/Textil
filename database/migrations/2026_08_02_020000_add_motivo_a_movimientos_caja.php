<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('movimientos_caja', function (Blueprint $table) {
            $table->foreignId('motivo_movimiento_id')->nullable()->after('tipo')->constrained('motivos_movimiento')->nullOnDelete();
            $table->string('descripcion', 255)->nullable()->after('monto');
        });

        Schema::table('motivos_movimiento', function (Blueprint $table) {
            $table->string('ambito', 20)->nullable()->after('tipo');
        });
    }

    public function down(): void
    {
        Schema::table('movimientos_caja', function (Blueprint $table) {
            $table->dropConstrainedForeignId('motivo_movimiento_id');
            $table->dropColumn('descripcion');
        });

        Schema::table('motivos_movimiento', function (Blueprint $table) {
            $table->dropColumn('ambito');
        });
    }
};
