<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->decimal('stock_anterior', 12, 2)->default(0)->after('stock_actual');
        });
    }

    public function down(): void
    {
        Schema::table('producto_almacen_stock', function (Blueprint $table) {
            $table->dropColumn('stock_anterior');
        });
    }
};
