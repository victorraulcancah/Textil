<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Devolver un anticipo: lo que sobra de un anticipo se le devuelve al cliente. Es un egreso de la caja de quien devuelve, en
 * uno o varios métodos (pago mixto), y baja el saldo del anticipo. Se puede anular: el saldo vuelve al anticipo.
 */
return new class extends Migration
{
    private const GESTION = ['admin', 'GERENCIA', 'SUPERVISOR', 'MASTER'];

    public function up(): void
    {
        Schema::table('anticipos', function (Blueprint $table) {
            // Lo ya devuelto al cliente; el saldo es monto − aplicado − devuelto.
            $table->decimal('monto_devuelto', 12, 2)->default(0)->after('monto_aplicado');
        });

        Schema::create('anticipo_devoluciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('anticipo_id')->constrained('anticipos')->cascadeOnDelete();
            $table->foreignId('usuario_id')->constrained('users');
            // El día en que se devolvió el dinero (el egreso de caja lo lleva).
            $table->date('fecha');
            $table->string('moneda', 3)->default('PEN');
            $table->decimal('monto', 12, 2);
            $table->string('observaciones', 255)->nullable();
            // vigente → anulada (el saldo vuelve al anticipo).
            $table->string('estado', 20)->default('vigente')->index();
            $table->foreignId('anulada_por')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('anulada_en')->nullable();
            $table->string('motivo_anulacion')->nullable();
            $table->timestamps();
        });

        // Cada método con el que se devolvió (pago mixto) y su egreso en la caja.
        Schema::create('anticipo_devolucion_pagos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('devolucion_id')->constrained('anticipo_devoluciones')->cascadeOnDelete();
            $table->string('forma_pago', 20);
            $table->foreignId('cuenta_bancaria_id')->nullable()->constrained('cuentas_bancarias')->nullOnDelete();
            $table->foreignId('billetera_id')->nullable()->constrained('billeteras_digitales')->nullOnDelete();
            $table->decimal('monto', 12, 2);
            $table->string('referencia', 100)->nullable();
            $table->foreignId('movimiento_caja_id')->nullable()->constrained('movimientos_caja')->nullOnDelete();
            $table->timestamps();
        });

        // El egreso de caja de una devolución.
        DB::table('motivos_movimiento')->updateOrInsert(
            ['nombre' => 'Devolución de anticipo', 'tipo' => 'salida', 'ambito' => 'caja'],
            ['es_sistema' => true, 'activo' => true, 'categoria_gasto' => 'no_operativo', 'created_at' => now(), 'updated_at' => now()],
        );

        // Devolver dinero lo decide quien gestiona, no cualquiera que registre anticipos.
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $permiso = Permission::firstOrCreate(['name' => 'ventas.anticipos.devolver', 'guard_name' => 'web']);
        foreach (Role::where('guard_name', 'web')->whereIn('name', self::GESTION)->get() as $rol) {
            $rol->givePermissionTo($permiso);
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Schema::dropIfExists('anticipo_devolucion_pagos');
        Schema::dropIfExists('anticipo_devoluciones');
        Schema::table('anticipos', function (Blueprint $table) {
            $table->dropColumn('monto_devuelto');
        });
        DB::table('motivos_movimiento')->where('nombre', 'Devolución de anticipo')->where('ambito', 'caja')->delete();
        Permission::where('name', 'ventas.anticipos.devolver')->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
