<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Los permisos del Estado de cuenta (config/permisos.php →
 * tesoreria.estado-cuenta), para que el servidor los tenga con solo migrar.
 */
return new class extends Migration
{
    private const ACCIONES = ['ver', 'exportar', 'imprimir'];

    public function up(): void
    {
        $permisos = collect(self::ACCIONES)
            ->map(fn ($accion) => Permission::firstOrCreate(['name' => "tesoreria.estado-cuenta.{$accion}", 'guard_name' => 'web']));

        // Quien ve las cuentas por cobrar también ve el estado de cuenta.
        Role::where('guard_name', 'web')->with('permissions:id,name')->get()
            ->filter(fn ($rol) => $rol->permissions->contains('name', 'tesoreria.cuentas-por-cobrar.ver'))
            ->each(fn ($rol) => $rol->givePermissionTo($permisos));

        $this->olvidarCache();
    }

    public function down(): void
    {
        Permission::where('name', 'like', 'tesoreria.estado-cuenta.%')->delete();
        $this->olvidarCache();
    }

    /** El árbol de permisos se lee de config y queda en caché: sin esto no se entera. */
    private function olvidarCache(): void
    {
        foreach (['permisos.rutas', 'permisos.patrones', 'permisos.documentos'] as $clave) {
            Cache::forget($clave);
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
