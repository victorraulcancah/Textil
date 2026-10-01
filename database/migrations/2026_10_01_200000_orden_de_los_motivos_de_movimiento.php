<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Los motivos de movimiento llevan su número de orden: así se listan y se ofrecen en el orden que se quiera. */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('motivos_movimiento', 'orden')) {
            Schema::table('motivos_movimiento', function (Blueprint $table) {
                $table->unsignedSmallInteger('orden')->default(0)->after('nombre');
            });
        }

        // Los que ya existen conservan el orden de siempre (el de creación).
        DB::table('motivos_movimiento')->where('orden', 0)->update(['orden' => DB::raw('id')]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('motivos_movimiento', 'orden')) {
            Schema::table('motivos_movimiento', function (Blueprint $table) {
                $table->dropColumn('orden');
            });
        }
    }
};
