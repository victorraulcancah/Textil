<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Accesos más finos que el rol: un usuario puede tener varios roles (sus
 * permisos se suman), recibir excepciones propias (una vez, por un tiempo o
 * permanentes) y pedir los permisos que le faltan; un administrador aprueba
 * o rechaza cada solicitud.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permiso_excepciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('permiso');
            // una_vez: se gasta con el primer uso que sale bien.
            // temporal: vale hasta expira_en. permanente: hasta que se revoque.
            $table->string('alcance', 20);
            $table->dateTime('expira_en')->nullable();
            $table->dateTime('usada_en')->nullable();
            $table->string('motivo', 500)->nullable();
            $table->foreignId('concedido_por')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('revocada_en')->nullable();
            $table->foreignId('revocada_por')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['user_id', 'permiso']);
        });

        Schema::create('solicitudes_permiso', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('permiso');
            $table->string('motivo', 500)->nullable();
            $table->string('estado', 20)->default('pendiente'); // pendiente | aprobada | rechazada
            $table->string('respuesta', 500)->nullable();
            $table->foreignId('resuelta_por')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('resuelta_en')->nullable();
            $table->foreignId('excepcion_id')->nullable()->constrained('permiso_excepciones')->nullOnDelete();
            $table->timestamps();

            $table->index(['estado', 'created_at']);
        });

        // Los permisos de la pantalla de accesos. Quien ya podía editar roles
        // recibe los mismos aquí, para no dejar a nadie sin la pantalla.
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $nuevos = collect(['ver', 'crear', 'editar', 'eliminar'])
            ->map(fn ($a) => Permission::firstOrCreate(['name' => "gestion.accesos.{$a}", 'guard_name' => 'web']));

        foreach (Role::where('guard_name', 'web')->get() as $rol) {
            if ($rol->hasPermissionTo('gestion.roles.editar')) {
                $rol->givePermissionTo($nuevos);
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Schema::dropIfExists('solicitudes_permiso');
        Schema::dropIfExists('permiso_excepciones');
        DB::table('permissions')->where('name', 'like', 'gestion.accesos.%')->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
