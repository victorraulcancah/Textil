<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Permisos propios para lo que se hace sobre movimientos y cierres de caja ya registrados.
 *
 * Anular un movimiento es libre por defecto: lo reciben todos los roles que ya trabajaban con esa pantalla. Lo demás
 * (editar, corregir pagos, convertir en anticipo, anular cierres, recierre, modificar una caja cerrada) lo reciben solo los
 * roles de gestión; el resto lo asigna quien administra los roles.
 */
return new class extends Migration
{
    /** Los roles que gestionan: reciben los permisos que no son libres. */
    private const GESTION = ['admin', 'GERENCIA', 'SUPERVISOR', 'MASTER'];

    public function up(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $libres = [
            // permiso nuevo => el permiso con el que ya se usaba esa pantalla
            'tesoreria.mi-caja.anular_movimiento' => 'tesoreria.mi-caja.crear',
            'tesoreria.cierres-caja.anular_movimiento' => 'tesoreria.cierres-caja.ver',
        ];
        $deGestion = [
            'tesoreria.mi-caja.editar_movimiento',
            'tesoreria.mi-caja.corregir_pago',
            'tesoreria.mi-caja.convertir_anticipo',
            'tesoreria.cierres-caja.anular_cierre',
            'tesoreria.cierres-caja.recerrar',
            'tesoreria.cierres-caja.modificar_cerrado',
        ];

        foreach ($libres as $nuevo => $base) {
            $permiso = Permission::firstOrCreate(['name' => $nuevo, 'guard_name' => 'web']);
            foreach (Role::where('guard_name', 'web')->get() as $rol) {
                if ($rol->hasPermissionTo($base)) {
                    $rol->givePermissionTo($permiso);
                }
            }
        }

        foreach ($deGestion as $nuevo) {
            $permiso = Permission::firstOrCreate(['name' => $nuevo, 'guard_name' => 'web']);
            foreach (Role::where('guard_name', 'web')->whereIn('name', self::GESTION)->get() as $rol) {
                $rol->givePermissionTo($permiso);
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Permission::whereIn('name', [
            'tesoreria.mi-caja.anular_movimiento', 'tesoreria.mi-caja.editar_movimiento', 'tesoreria.mi-caja.corregir_pago',
            'tesoreria.mi-caja.convertir_anticipo', 'tesoreria.cierres-caja.anular_movimiento', 'tesoreria.cierres-caja.anular_cierre',
            'tesoreria.cierres-caja.recerrar', 'tesoreria.cierres-caja.modificar_cerrado',
        ])->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
