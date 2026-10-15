<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * El cierre de caja es un movimiento del sistema que se aprueba:
 *
 *  - Al cerrar se cuenta el efectivo y se indica cuánto se deja para el turno siguiente. Lo demás sale de la caja como
 *    un egreso con el motivo del sistema "Movimiento de cierre de caja".
 *  - El cierre queda pendiente hasta que alguien con permiso lo aprueba; quien lo solicitó puede anularlo (reabre su
 *    caja) y cerrar de nuevo con lo corregido.
 *
 * Los cierres que ya existían quedan aprobados y siguen dejando lo que contaron.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cierres_caja', function (Blueprint $table) {
            // Lo que queda en el cajón para quien abre después (null: cierres anteriores, que dejaban lo contado).
            $table->decimal('monto_dejado', 12, 2)->nullable()->after('diferencia');
            // Lo que salió de la caja al cerrar (contado − dejado): el egreso del movimiento de cierre.
            $table->decimal('monto_retirado', 12, 2)->default(0)->after('monto_dejado');
            // pendiente → aprobado | anulado. Los que ya existían nacen aprobados.
            $table->string('estado', 20)->default('aprobado')->after('monto_retirado')->index();
            $table->foreignId('movimiento_caja_id')->nullable()->after('estado')->constrained('movimientos_caja')->nullOnDelete();
            $table->foreignId('aprobado_por')->nullable()->after('movimiento_caja_id')->constrained('users')->nullOnDelete();
            $table->dateTime('aprobado_en')->nullable()->after('aprobado_por');
            $table->foreignId('anulado_por')->nullable()->after('aprobado_en')->constrained('users')->nullOnDelete();
            $table->dateTime('anulado_en')->nullable()->after('anulado_por');
            $table->string('anulado_motivo')->nullable()->after('anulado_en');
        });

        // El motivo del sistema con el que sale lo retirado al cerrar.
        DB::table('motivos_movimiento')->updateOrInsert(
            ['nombre' => 'Movimiento de cierre de caja', 'tipo' => 'salida', 'ambito' => 'caja'],
            ['es_sistema' => true, 'activo' => true, 'categoria_gasto' => null, 'created_at' => now(), 'updated_at' => now()],
        );

        // Aprobar un cierre es su propia acción. Quien ya podía editar cierres la recibe, para no dejarlo sin ella.
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $permiso = Permission::firstOrCreate(['name' => 'tesoreria.cierres-caja.aprobar', 'guard_name' => 'web']);
        foreach (Role::where('guard_name', 'web')->get() as $rol) {
            if ($rol->hasPermissionTo('tesoreria.cierres-caja.editar')) {
                $rol->givePermissionTo($permiso);
            }
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Schema::table('cierres_caja', function (Blueprint $table) {
            $table->dropConstrainedForeignId('anulado_por');
            $table->dropConstrainedForeignId('aprobado_por');
            $table->dropConstrainedForeignId('movimiento_caja_id');
            $table->dropColumn(['monto_dejado', 'monto_retirado', 'estado', 'aprobado_en', 'anulado_en', 'anulado_motivo']);
        });

        Permission::where('name', 'tesoreria.cierres-caja.aprobar')->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
