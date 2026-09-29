<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

/**
 * La línea de crédito del cliente: cuánto se le fía, en qué moneda, hasta
 * cuándo, a cuántos días, y una ampliación temporal.
 *
 * Dos permisos nuevos, que de entrada solo tiene el administrador y se dan
 * desde Roles:
 *  - ventas.clientes.linea_credito: aprobar o cambiar la línea.
 *  - ventas.notas-venta.exceder_credito: vender a crédito aunque se pase.
 */
return new class extends Migration
{
    private const PERMISOS = ['ventas.clientes.linea_credito', 'ventas.notas-venta.exceder_credito'];

    public function up(): void
    {
        Schema::create('lineas_credito', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cliente_id')->unique()->constrained('clientes')->cascadeOnDelete();
            $table->string('moneda', 3)->default('PEN');
            $table->decimal('limite', 14, 2)->default(0);
            $table->date('fecha_aprobacion')->nullable();
            // Hasta cuándo vale; sin fecha no vence.
            $table->date('vigente_hasta')->nullable();
            // Se puede suspender sin perder lo pactado.
            $table->boolean('activa')->default(true);
            // contado | credito: cómo se le vende por defecto.
            $table->string('condicion_venta', 10)->default('contado');
            $table->unsignedSmallInteger('dias_credito')->default(0);
            // Margen antes de que una cuota cuente como vencida.
            $table->unsignedSmallInteger('dias_gracia')->default(0);
            // Aumento temporal: importe | porcentaje, hasta una fecha.
            $table->string('ampliacion_tipo', 12)->nullable();
            $table->decimal('ampliacion_valor', 14, 2)->default(0);
            $table->date('ampliacion_hasta')->nullable();
            $table->text('observaciones')->nullable();
            $table->timestamps();
        });

        foreach (self::PERMISOS as $nombre) {
            Permission::firstOrCreate(['name' => $nombre, 'guard_name' => 'web']);
        }
        $this->olvidarCache();
    }

    public function down(): void
    {
        Schema::dropIfExists('lineas_credito');
        Permission::whereIn('name', self::PERMISOS)->delete();
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
