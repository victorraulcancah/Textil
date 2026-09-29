<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

/**
 * El tipo de cambio ya no tiene pantalla propia: el de SUNAT se trae solo al
 * vender o cobrar, y el comercial se escribe en el mismo cobro. Se quitan los
 * permisos de esa pantalla (tesoreria.tipos-cambio.*).
 */
return new class extends Migration
{
    public function up(): void
    {
        Permission::where('name', 'like', 'tesoreria.tipos-cambio.%')->delete();
        $this->olvidarCache();
    }

    public function down(): void
    {
        foreach (['ver', 'editar'] as $accion) {
            Permission::firstOrCreate(['name' => "tesoreria.tipos-cambio.{$accion}", 'guard_name' => 'web']);
        }
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
