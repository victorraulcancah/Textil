<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Una caja puede tener varios usuarios (turnos): todos gestionan la misma caja, pero solo uno a la vez la tiene
 * abierta. Antes `cajas.usuario_id` guardaba un único usuario; ahora van en `caja_usuario`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('caja_usuario')) {
            Schema::create('caja_usuario', function (Blueprint $table) {
                $table->foreignId('caja_id')->constrained('cajas')->cascadeOnDelete();
                $table->foreignId('usuario_id')->constrained('users')->cascadeOnDelete();
                $table->timestamps();
                $table->primary(['caja_id', 'usuario_id']);
            });
        }

        if (Schema::hasColumn('cajas', 'usuario_id')) {
            $ahora = now();
            foreach (DB::table('cajas')->whereNotNull('usuario_id')->get(['id', 'usuario_id']) as $c) {
                DB::table('caja_usuario')->insertOrIgnore(['caja_id' => $c->id, 'usuario_id' => $c->usuario_id, 'created_at' => $ahora, 'updated_at' => $ahora]);
            }

            Schema::table('cajas', function (Blueprint $table) {
                $table->dropForeign(['usuario_id']);
            });
            Schema::table('cajas', function (Blueprint $table) {
                $table->dropUnique(['usuario_id', 'almacen_id']);
            });
            Schema::table('cajas', function (Blueprint $table) {
                $table->dropColumn('usuario_id');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('cajas', 'usuario_id')) {
            Schema::table('cajas', function (Blueprint $table) {
                $table->foreignId('usuario_id')->nullable()->after('almacen_id')->constrained('users')->nullOnDelete();
            });
        }
        foreach (DB::table('caja_usuario')->orderBy('caja_id')->get() as $r) {
            DB::table('cajas')->where('id', $r->caja_id)->whereNull('usuario_id')->update(['usuario_id' => $r->usuario_id]);
        }
        Schema::dropIfExists('caja_usuario');
    }
};
