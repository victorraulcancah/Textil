<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Una caja por usuario y por almacén: un usuario puede tener una caja en cada almacén donde trabaja (victor con una
 * caja en el almacén 1, otra en el 2, otra en el 3). Antes `users.caja_id` guardaba una sola; ahora la dueña de la
 * caja es `cajas.usuario_id` y los almacenes donde puede trabajar un usuario están en `almacen_user`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('cajas', 'usuario_id')) {
            Schema::table('cajas', function (Blueprint $table) {
                $table->foreignId('usuario_id')->nullable()->after('almacen_id')->constrained('users')->nullOnDelete();
                // Una sola caja por usuario en cada almacén.
                $table->unique(['usuario_id', 'almacen_id']);
            });
        }

        if (! Schema::hasTable('almacen_user')) {
            Schema::create('almacen_user', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('almacen_id')->constrained('almacenes')->cascadeOnDelete();
                $table->timestamps();
                $table->unique(['user_id', 'almacen_id']);
            });
        }

        if (Schema::hasColumn('users', 'caja_id')) {
            foreach (DB::table('users')->whereNotNull('caja_id')->get(['id', 'caja_id']) as $u) {
                DB::table('cajas')->where('id', $u->caja_id)->whereNull('usuario_id')->update(['usuario_id' => $u->id]);
            }
        }

        // Cada usuario puede trabajar en su almacén y en los de sus cajas.
        $ahora = now();
        $pares = collect();
        foreach (DB::table('users')->whereNotNull('almacen_id')->get(['id', 'almacen_id']) as $u) {
            $pares->push([$u->id, $u->almacen_id]);
        }
        foreach (DB::table('cajas')->whereNotNull('usuario_id')->whereNotNull('almacen_id')->get(['usuario_id', 'almacen_id']) as $c) {
            $pares->push([$c->usuario_id, $c->almacen_id]);
        }
        foreach ($pares->unique(fn ($p) => $p[0].'-'.$p[1]) as [$userId, $almacenId]) {
            DB::table('almacen_user')->insertOrIgnore(['user_id' => $userId, 'almacen_id' => $almacenId, 'created_at' => $ahora, 'updated_at' => $ahora]);
        }

        if (Schema::hasColumn('users', 'caja_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropConstrainedForeignId('caja_id');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('users', 'caja_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->foreignId('caja_id')->nullable()->constrained('cajas')->nullOnDelete();
            });
        }
        foreach (DB::table('cajas')->whereNotNull('usuario_id')->orderBy('id')->get(['id', 'usuario_id']) as $c) {
            DB::table('users')->where('id', $c->usuario_id)->whereNull('caja_id')->update(['caja_id' => $c->id]);
        }
        Schema::dropIfExists('almacen_user');
        Schema::table('cajas', function (Blueprint $table) {
            $table->dropUnique(['usuario_id', 'almacen_id']);
            $table->dropConstrainedForeignId('usuario_id');
        });
    }
};
