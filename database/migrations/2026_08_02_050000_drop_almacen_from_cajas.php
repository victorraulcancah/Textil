<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Una caja se asigna a un USUARIO, no a un almacén. Se elimina almacen_id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cajas', function (Blueprint $table) {
            if (Schema::hasColumn('cajas', 'almacen_id')) {
                $table->dropConstrainedForeignId('almacen_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('cajas', function (Blueprint $table) {
            $table->foreignId('almacen_id')->nullable()->after('nombre')->constrained('almacenes')->nullOnDelete();
        });
    }
};
