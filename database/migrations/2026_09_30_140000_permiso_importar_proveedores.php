<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * La carga de proveedores por Excel es su propia acción (importar). Quien ya
 * podía crear proveedores la recibe, para no quitarle lo que hacía.
 */
return new class extends Migration
{
    public function up(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $permiso = Permission::firstOrCreate(['name' => 'compras.proveedores.importar', 'guard_name' => 'web']);

        foreach (Role::where('guard_name', 'web')->get() as $rol) {
            if ($rol->hasPermissionTo('compras.proveedores.crear')) {
                $rol->givePermissionTo($permiso);
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Permission::where('name', 'compras.proveedores.importar')->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
