<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Anticipos de clientes: dinero que el cliente entrega antes de que exista la venta. Cada anticipo está en soles o en
 * dólares, entra a la caja del que lo recibe y queda con un saldo disponible (monto − aplicado) para aplicarlo después.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('anticipos', function (Blueprint $table) {
            $table->id();
            $table->string('serie', 10);
            $table->string('numero', 20);
            $table->foreignId('almacen_id')->constrained('almacenes');
            $table->foreignId('cliente_id')->constrained('clientes');
            $table->foreignId('usuario_id')->constrained('users');
            // El día en que el cliente entregó el dinero (se puede elegir uno anterior); created_at es el registro real.
            $table->date('fecha');
            $table->string('moneda', 3)->default('PEN');
            $table->decimal('monto', 12, 2);
            // Lo que ya se aplicó a ventas; el saldo es monto − monto_aplicado.
            $table->decimal('monto_aplicado', 12, 2)->default(0);
            $table->string('forma_pago', 20);
            $table->foreignId('cuenta_bancaria_id')->nullable()->constrained('cuentas_bancarias')->nullOnDelete();
            $table->foreignId('billetera_id')->nullable()->constrained('billeteras_digitales')->nullOnDelete();
            $table->string('referencia', 100)->nullable();
            // El ingreso que dejó en la caja de quien lo recibió.
            $table->foreignId('movimiento_caja_id')->nullable()->constrained('movimientos_caja')->nullOnDelete();
            $table->string('observaciones', 255)->nullable();
            // vigente → anulado (aplicado del todo: lo marca la aplicación, más adelante).
            $table->string('estado', 20)->default('vigente')->index();
            $table->string('motivo_anulacion')->nullable();
            $table->foreignId('usuario_anula_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('fecha_anulacion')->nullable();
            $table->timestamps();

            $table->unique(['serie', 'numero']);
        });

        // El ingreso de caja que deja un anticipo.
        DB::table('motivos_movimiento')->updateOrInsert(
            ['nombre' => 'Ingreso por anticipo', 'tipo' => 'entrada', 'ambito' => 'caja'],
            ['es_sistema' => true, 'activo' => true, 'categoria_gasto' => null, 'created_at' => now(), 'updated_at' => now()],
        );

        // Los permisos del submódulo; los reciben quienes ya trabajaban con proformas, para no dejarlos sin acceso.
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        foreach (['ver', 'crear', 'editar', 'eliminar'] as $accion) {
            $permiso = Permission::firstOrCreate(['name' => "ventas.anticipos.{$accion}", 'guard_name' => 'web']);
            foreach (Role::where('guard_name', 'web')->get() as $rol) {
                if ($rol->hasPermissionTo("ventas.notas-venta.{$accion}")) {
                    $rol->givePermissionTo($permiso);
                }
            }
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Schema::dropIfExists('anticipos');
        DB::table('motivos_movimiento')->where('nombre', 'Ingreso por anticipo')->where('ambito', 'caja')->delete();
        Permission::where('name', 'like', 'ventas.anticipos.%')->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
