<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('recepciones_compra', function (Blueprint $table) {
            $table->boolean('stock_aplicado')->default(false)->after('estado');
        });
    }

    public function down(): void
    {
        Schema::table('recepciones_compra', function (Blueprint $table) {
            $table->dropColumn('stock_aplicado');
        });
    }
};
