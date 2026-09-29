<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * La categoría y la actividad comercial del cliente pasan a ser catálogos que
 * se administran —con su pantalla y el "+" para crear desde el cliente— en
 * vez de texto libre, donde cada quien escribía distinto lo mismo.
 *
 * Sus permisos (config/permisos.php → ventas.*) van aquí para que el servidor
 * los tenga con solo migrar. No se corre PermisosSeeder: les daría todo a
 * todos los roles.
 */
return new class extends Migration
{
    /** tabla del catálogo => [columna de texto que reemplaza, columna nueva en clientes] */
    private const CATALOGOS = [
        'categorias_comerciales' => ['categoria_comercial', 'categoria_comercial_id'],
        'actividades_comerciales' => ['actividad_comercial', 'actividad_comercial_id'],
    ];

    private const SUBMODULOS = ['ventas.categorias-comerciales', 'ventas.actividades-comerciales'];

    private const ACCIONES = ['ver', 'crear', 'editar', 'eliminar'];

    public function up(): void
    {
        foreach (self::CATALOGOS as $tabla => [$texto, $columna]) {
            Schema::create($tabla, function (Blueprint $table) {
                $table->id();
                $table->string('nombre', 150)->unique();
                $table->boolean('activo')->default(true);
                $table->timestamps();
            });

            Schema::table('clientes', function (Blueprint $table) use ($tabla, $texto, $columna) {
                $table->foreignId($columna)->nullable()->after($texto)->constrained($tabla)->nullOnDelete();
            });

            // Lo que ya se había escrito pasa al catálogo, sin repetirse.
            $ahora = now();
            DB::table('clientes')->whereNotNull($texto)->get(['id', $texto])
                ->each(function ($cliente) use ($tabla, $texto, $columna, $ahora) {
                    $nombre = mb_substr(trim((string) $cliente->{$texto}), 0, 150);
                    if ($nombre === '') {
                        return;
                    }
                    $id = DB::table($tabla)->where('nombre', $nombre)->value('id')
                        ?? DB::table($tabla)->insertGetId([
                            'nombre' => $nombre, 'activo' => true, 'created_at' => $ahora, 'updated_at' => $ahora,
                        ]);
                    DB::table('clientes')->where('id', $cliente->id)->update([$columna => $id]);
                });

            Schema::table('clientes', function (Blueprint $table) use ($texto) {
                $table->dropColumn($texto);
            });
        }

        $permisos = collect(self::SUBMODULOS)->crossJoin(self::ACCIONES)
            ->map(fn ($par) => Permission::firstOrCreate(['name' => implode('.', $par), 'guard_name' => 'web']));

        // Quien crea o edita clientes también maneja estos catálogos (y el "+"
        // del formulario del cliente).
        Role::where('guard_name', 'web')->with('permissions:id,name')->get()
            ->filter(fn ($rol) => $rol->permissions->whereIn('name', ['ventas.clientes.crear', 'ventas.clientes.editar'])->isNotEmpty())
            ->each(fn ($rol) => $rol->givePermissionTo($permisos));

        $this->olvidarCache();
    }

    public function down(): void
    {
        foreach (self::CATALOGOS as $tabla => [$texto, $columna]) {
            Schema::table('clientes', function (Blueprint $table) use ($texto, $columna) {
                $table->string($texto)->nullable()->after($columna);
            });

            DB::table('clientes')->whereNotNull($columna)->get(['id', $columna])
                ->each(fn ($cliente) => DB::table('clientes')->where('id', $cliente->id)->update([
                    $texto => DB::table($tabla)->where('id', $cliente->{$columna})->value('nombre'),
                ]));

            Schema::table('clientes', function (Blueprint $table) use ($columna) {
                $table->dropConstrainedForeignId($columna);
            });
            Schema::dropIfExists($tabla);
        }

        foreach (self::SUBMODULOS as $submodulo) {
            Permission::where('name', 'like', "{$submodulo}.%")->delete();
        }
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
