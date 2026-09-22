<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transferencias', function (Blueprint $table) {
            $table->string('motivo_rechazo')->nullable()->after('observaciones');
        });
    }

    public function down(): void
    {
        Schema::table('transferencias', function (Blueprint $table) {
            $table->dropColumn('motivo_rechazo');
        });
    }
};
