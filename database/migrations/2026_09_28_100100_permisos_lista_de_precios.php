<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Los permisos de la Lista de precios (config/permisos.php → catalogo.lista-precios).
 *
 * Van en una migración para que el servidor los tenga con solo migrar: si
 * falta la fila del permiso, a nadie (salvo al súper admin) se le puede dar,
 * y la pantalla responde 403. No se corre PermisosSeeder: les daría todo a
 * todos los roles.
 */
return new class extends Migration
{
    private const ACCIONES = ['ver', 'crear', 'editar', 'eliminar'];

    public function up(): void
    {
        $permisos = collect(self::ACCIONES)->map(fn ($accion) => Permission::firstOrCreate([
            'name' => "catalogo.lista-precios.{$accion}",
            'guard_name' => 'web',
        ]));

        // Quien ya edita productos, también maneja sus precios.
        Role::where('guard_name', 'web')->with('permissions:id,name')->get()
            ->filter(fn ($rol) => $rol->permissions->contains('name', 'catalogo.productos.editar'))
            ->each(fn ($rol) => $rol->givePermissionTo($permisos));

        $this->olvidarCache();
    }

    public function down(): void
    {
        Permission::where('name', 'like', 'catalogo.lista-precios.%')->delete();
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
