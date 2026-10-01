<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** El "orden" del motivo se escribe como texto (OC-015, 001…), no como número. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('motivos_movimiento', function (Blueprint $table) {
            $table->string('orden', 60)->nullable()->default(null)->change();
        });
    }

    public function down(): void
    {
        Schema::table('motivos_movimiento', function (Blueprint $table) {
            $table->unsignedSmallInteger('orden')->default(0)->change();
        });
    }
};
