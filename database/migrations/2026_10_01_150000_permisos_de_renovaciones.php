<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Las renovaciones de letras tienen su propia pantalla (Tesorería → Renovaciones) y sus
 * permisos. Quien ya veía las letras de cambio recibe los mismos aquí, para que no pierda
 * lo que hacía: crear una renovación era parte de crear letras.
 */
return new class extends Migration
{
    public function up(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $nuevos = collect(['ver', 'crear', 'editar', 'eliminar'])
            ->map(fn ($a) => Permission::firstOrCreate(['name' => "tesoreria.renovaciones.{$a}", 'guard_name' => 'web']));

        foreach (Role::where('guard_name', 'web')->get() as $rol) {
            if ($rol->hasPermissionTo('tesoreria.letras-cambio.ver')) {
                $rol->givePermissionTo($nuevos);
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Permission::where('name', 'like', 'tesoreria.renovaciones.%')->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
