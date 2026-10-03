<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cada usuario trabaja en un solo almacén (sucursal): ahí vende, hace pedidos, ajustes y préstamos. Puede ver los demás.
 * El Super Admin no lleva almacén: opera en todos. Los usuarios que ya existen se quedan en el almacén predeterminado
 * (o en el primero) para que sigan funcionando como hasta ahora.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'almacen_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->foreignId('almacen_id')->nullable()->after('caja_id')->constrained('almacenes')->nullOnDelete();
            });
        }

        $almacen = DB::table('almacenes')->where('predeterminado', true)->value('id') ?? DB::table('almacenes')->orderBy('id')->value('id');
        if (! $almacen) {
            return;
        }

        $superAdmins = DB::table('model_has_roles')
            ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
            ->where('roles.name', config('permisos.super_admin'))
            ->where('model_has_roles.model_type', 'App\\Models\\User')
            ->pluck('model_has_roles.model_id');

        DB::table('users')->whereNull('almacen_id')->whereNotIn('id', $superAdmins)->update(['almacen_id' => $almacen]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'almacen_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropConstrainedForeignId('almacen_id');
            });
        }
    }
};
