<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('series_documento', function (Blueprint $table) {
            $table->id();
            $table->string('tipo_documento')->default('nota_venta');
            $table->string('serie');
            $table->integer('numero_actual')->default(0);
            $table->foreignId('almacen_id')->nullable()->constrained('almacenes')->nullOnDelete();
            $table->boolean('activo')->default(true);
            $table->timestamps();

            $table->unique(['tipo_documento', 'serie']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('series_documento');
    }
};
