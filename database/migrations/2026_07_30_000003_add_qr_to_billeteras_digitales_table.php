<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('billeteras_digitales', function (Blueprint $table) {
            $table->string('qr')->nullable()->after('numero_asociado');
        });
    }

    public function down(): void
    {
        Schema::table('billeteras_digitales', function (Blueprint $table) {
            $table->dropColumn('qr');
        });
    }
};
