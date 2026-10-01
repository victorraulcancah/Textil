<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Letras de cambio: se emiten desde una cuenta por cobrar (la venta al crédito
 * que se financia con letras) y se consultan en su propia pantalla, con su PDF.
 *
 * La letra guarda una copia de los datos del aceptante y del aval al momento
 * de emitirla: es un título valor, y no debe cambiar si después se edita el
 * cliente.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('letras_cambio', function (Blueprint $table) {
            $table->id();
            // El número que lleva la letra impresa (correlativo del sistema).
            $table->unsignedInteger('numero')->unique();
            $table->foreignId('cuenta_por_cobrar_id')->nullable()->constrained('cuentas_por_cobrar')->nullOnDelete();
            $table->foreignId('cliente_id')->nullable()->constrained('clientes')->nullOnDelete();
            // El documento que se financia: la factura o nota de venta (F001-1191).
            $table->string('referencia', 60)->nullable();
            $table->date('fecha_giro');
            $table->string('lugar_giro', 120)->nullable();
            $table->date('fecha_vencimiento');
            $table->string('moneda', 3)->default('PEN');
            $table->decimal('importe', 14, 2);

            $table->string('aceptante_nombre', 255);
            $table->string('aceptante_documento', 20)->nullable();
            $table->string('aceptante_domicilio', 255)->nullable();
            $table->string('aceptante_localidad', 120)->nullable();
            $table->string('aceptante_telefono', 30)->nullable();

            $table->string('aval_nombre', 255)->nullable();
            $table->string('aval_documento', 20)->nullable();
            $table->string('aval_domicilio', 255)->nullable();
            $table->string('aval_localidad', 120)->nullable();

            // Cuenta para el débito automático, si el aceptante la da.
            $table->string('banco', 80)->nullable();
            $table->string('oficina', 20)->nullable();
            $table->string('cuenta', 40)->nullable();
            $table->string('dc', 4)->nullable();

            $table->string('estado', 20)->default('emitida'); // emitida | anulada
            $table->foreignId('usuario_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['estado', 'fecha_vencimiento']);
        });

        // Los permisos de la pantalla. Quien ya ve las cuentas por cobrar los recibe todos.
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $nuevos = collect(['ver', 'crear', 'editar', 'eliminar', 'imprimir'])
            ->map(fn ($a) => Permission::firstOrCreate(['name' => "tesoreria.letras-cambio.{$a}", 'guard_name' => 'web']));

        foreach (Role::where('guard_name', 'web')->get() as $rol) {
            if ($rol->hasPermissionTo('tesoreria.cuentas-por-cobrar.ver')) {
                $rol->givePermissionTo($nuevos);
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Schema::dropIfExists('letras_cambio');
        Permission::where('name', 'like', 'tesoreria.letras-cambio.%')->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
