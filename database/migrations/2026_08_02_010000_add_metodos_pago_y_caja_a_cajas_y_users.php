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
        Schema::create('caja_metodo_pago', function (Blueprint $table) {
            $table->id();
            $table->foreignId('caja_id')->constrained('cajas')->cascadeOnDelete();
            $table->foreignId('metodo_pago_id')->constrained('metodos_pago')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['caja_id', 'metodo_pago_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('caja_id')->nullable()->after('empresa_id')->constrained('cajas')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('caja_id');
        });

        Schema::dropIfExists('caja_metodo_pago');
    }
};
