<?php

namespace Database\Seeders;

use App\Support\Permisos;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Crea los permisos del árbol (config/permisos.php) y se los da a los roles
 * que ya existen: al agregar un módulo nuevo, nadie se queda sin acceso a lo
 * que ya podía hacer.
 *
 *   php artisan db:seed --class=PermisosSeeder
 */
class PermisosSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $creados = 0;
        foreach (Permisos::todos() as $nombre) {
            $permiso = Permission::firstOrCreate(
                ['name' => $nombre, 'guard_name' => 'web'],
            );
            if ($permiso->wasRecentlyCreated) {
                $creados++;
            }
        }

        // Por defecto un rol lo puede todo: los permisos se quitan a mano
        // cuando se quiere limitar, no al revés.
        $roles = Role::where('guard_name', 'web')->get();
        foreach ($roles as $rol) {
            $rol->syncPermissions(Permission::where('guard_name', 'web')->get());
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $this->command?->info("Permisos: {$creados} creados; {$roles->count()} roles con todos los permisos.");
    }
}
