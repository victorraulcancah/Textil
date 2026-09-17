<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A qué usuario le corresponde cada cliente: el vendedor puede tener permiso
 * solo para "ver" (sus propios clientes) o para "ver todo" (los de todos).
 * Sin ejecutivo asignado, el cliente solo lo ve quien tenga "ver todo".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clientes', function (Blueprint $table) {
            $table->foreignId('ejecutivo_id')->nullable()->after('email')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('clientes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('ejecutivo_id');
        });
    }
};
