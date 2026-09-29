<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * El tipo de cambio de cada día: el de SUNAT (compra y venta), que el sistema
 * trae solo, y el comercial, que la empresa pone a mano para cobrar en soles
 * lo que se debe en dólares.
 *
 * Su permiso (config/permisos.php → tesoreria.tipos-cambio) va aquí para que
 * el servidor lo tenga con solo migrar.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tipos_cambio', function (Blueprint $table) {
            $table->id();
            $table->date('fecha')->unique();
            // SUNAT: lo publicado ese día.
            $table->decimal('compra', 8, 4)->nullable();
            $table->decimal('venta', 8, 4)->nullable();
            // El de la empresa para cobrar en soles; se pone a mano.
            $table->decimal('comercial', 8, 4)->nullable();
            $table->timestamps();
        });

        $permisos = collect(['ver', 'editar'])
            ->map(fn ($accion) => Permission::firstOrCreate(['name' => "tesoreria.tipos-cambio.{$accion}", 'guard_name' => 'web']));

        // Quien cobra deudas también pone el tipo de cambio comercial del día.
        Role::where('guard_name', 'web')->with('permissions:id,name')->get()
            ->filter(fn ($rol) => $rol->permissions->contains('name', 'tesoreria.cuentas-por-cobrar.editar'))
            ->each(fn ($rol) => $rol->givePermissionTo($permisos));

        $this->olvidarCache();
    }

    public function down(): void
    {
        Schema::dropIfExists('tipos_cambio');
        Permission::where('name', 'like', 'tesoreria.tipos-cambio.%')->delete();
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
