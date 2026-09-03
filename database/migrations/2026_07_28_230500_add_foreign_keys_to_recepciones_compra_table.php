<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('recepciones_compra', function (Blueprint $table) {
            $table->foreign('orden_compra_id')->references('id')->on('ordenes_compra')->nullOnDelete();
            $table->foreign('proveedor_id')->references('id')->on('proveedores')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('recepciones_compra', function (Blueprint $table) {
            $table->dropForeign(['orden_compra_id']);
            $table->dropForeign(['proveedor_id']);
        });
    }
};
