<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('billeteras_digitales', function (Blueprint $table) {
            $table->foreignId('cuenta_bancaria_id')->nullable()->after('numero_asociado')
                ->constrained('cuentas_bancarias')->nullOnDelete();
            $table->string('titular')->nullable()->after('cuenta_bancaria_id');
        });
    }

    public function down(): void
    {
        Schema::table('billeteras_digitales', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cuenta_bancaria_id');
            $table->dropColumn('titular');
        });
    }
};
