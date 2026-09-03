<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Abarrotes opera SIN IGV (solo soles). Se elimina la columna afecto_igv.
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('productos', 'afecto_igv')) {
            Schema::table('productos', function (Blueprint $table) {
                $table->dropColumn('afecto_igv');
            });
        }
    }

    public function down(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            $table->boolean('afecto_igv')->default(true);
        });
    }
};
