<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            $table->foreignId('unidad_compra_id')->nullable()->after('unidad_medida_id')
                ->constrained('unidades_medida')->nullOnDelete();
            $table->foreignId('unidad_base_id')->nullable()->after('unidad_compra_id')
                ->constrained('unidades_medida')->nullOnDelete();
            $table->decimal('factor_compra_base', 12, 2)->default(1)->after('unidad_base_id');
        });
    }

    public function down(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            $table->dropConstrainedForeignId('unidad_compra_id');
            $table->dropConstrainedForeignId('unidad_base_id');
            $table->dropColumn('factor_compra_base');
        });
    }
};
