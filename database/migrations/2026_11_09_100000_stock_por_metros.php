<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Stock por metros: tela suelta que se vende por corte, sin escanear el QR de un rollo.
 *
 * - `stock_metros`: el saldo por tela, color y almacén (lo suelto y lo ya apartado por pedidos).
 * - `conversiones_metros`: cada vez que se pasan metros de un rollo al saldo suelto (quién, qué rollo, cuántos).
 * - En las líneas del pedido: `sin_qr` (la línea se vende del saldo suelto) y `preparado_at` (el almacenero la marcó
 *   como preparada, sin escanear nada).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_metros', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->constrained('productos');
            $table->foreignId('producto_color_id')->nullable()->constrained('producto_colores');
            $table->foreignId('almacen_id')->constrained('almacenes');
            $table->decimal('metros', 12, 2)->default(0);
            // Lo que los pedidos ya solicitados tienen apartado de ese saldo.
            $table->decimal('reservado', 12, 2)->default(0);
            $table->timestamps();

            $table->unique(['producto_id', 'producto_color_id', 'almacen_id'], 'stock_metros_unico');
        });

        Schema::create('conversiones_metros', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rollo_id')->constrained('rollos');
            $table->foreignId('producto_id')->constrained('productos');
            $table->foreignId('producto_color_id')->nullable()->constrained('producto_colores');
            $table->foreignId('almacen_id')->constrained('almacenes');
            $table->decimal('metros', 12, 2);
            // Lo que medía el rollo antes y lo que le quedó después de convertir.
            $table->decimal('metros_rollo_antes', 12, 2);
            $table->decimal('metros_rollo_despues', 12, 2);
            $table->foreignId('usuario_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('observaciones', 255)->nullable();
            $table->timestamps();

            $table->index('rollo_id');
        });

        Schema::table('orden_venta_detalles', function (Blueprint $table) {
            // La línea se vende del stock por metros: en preparación no se escanea, solo se marca como preparada.
            $table->boolean('sin_qr')->default(false)->after('modo');
            $table->dateTime('preparado_at')->nullable()->after('sin_qr');
            $table->foreignId('usuario_prepara_id')->nullable()->after('preparado_at')->constrained('users')->nullOnDelete();
        });

        $this->permisos();
    }

    public function down(): void
    {
        Schema::table('orden_venta_detalles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('usuario_prepara_id');
            $table->dropColumn(['sin_qr', 'preparado_at']);
        });

        Schema::dropIfExists('conversiones_metros');
        Schema::dropIfExists('stock_metros');

        Permission::where('name', 'like', 'inventario.stock-metros.%')->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    /** Quien ya trabajaba con el stock por rollo recibe los mismos permisos sobre el stock por metros. */
    private function permisos(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (['ver', 'crear', 'editar', 'eliminar'] as $accion) {
            $permiso = Permission::firstOrCreate(['name' => "inventario.stock-metros.{$accion}", 'guard_name' => 'web']);

            foreach (Role::where('guard_name', 'web')->get() as $rol) {
                if ($rol->hasPermissionTo("inventario.rollos.{$accion}")) {
                    $rol->givePermissionTo($permiso);
                }
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
