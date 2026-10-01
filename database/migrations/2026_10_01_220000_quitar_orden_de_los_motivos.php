<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** El campo "orden" de los motivos no hacía falta: el que se pide es el origen (manual o del sistema). */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('motivos_movimiento', 'orden')) {
            Schema::table('motivos_movimiento', function (Blueprint $table) {
                $table->dropColumn('orden');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('motivos_movimiento', 'orden')) {
            Schema::table('motivos_movimiento', function (Blueprint $table) {
                $table->string('orden', 60)->nullable()->after('nombre');
            });
        }
    }
};
