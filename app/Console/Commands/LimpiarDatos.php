<?php

namespace App\Console\Commands;

use Database\Seeders\CatalogosBaseSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\PermissionRegistrar;

/**
 * Deja el sistema como recién instalado para empezar con datos reales.
 *
 * Borra todo lo que se cargó —productos, clientes, proveedores, almacenes,
 * compras, ventas, stock, rollos, cajas, auditoría…— y conserva solo el
 * acceso (roles, permisos y usuarios) y los datos de la empresa.
 *
 * Los catálogos base del sistema (unidades de medida, métodos de pago,
 * motivos) se vacían y se vuelven a sembrar limpios, como en una instalación
 * nueva, y las numeraciones (C001, T001, NV01…) vuelven a empezar en 1.
 *
 *   php artisan datos:limpiar --simular    solo muestra qué borraría
 *   php artisan datos:limpiar              pide escribir LIMPIAR para confirmar
 *   php artisan datos:limpiar --force      sin preguntar
 */
class LimpiarDatos extends Command
{
    protected $signature = 'datos:limpiar
        {--simular : Solo muestra qué se borraría, sin tocar nada}
        {--force : No pedir confirmación}';

    protected $description = 'Borra todos los datos del sistema menos roles, permisos, usuarios y empresa';

    /** Lo que se conserva: el acceso al sistema y los datos de la empresa. */
    private const CONSERVAR = [
        'roles',
        'permissions',
        'role_has_permissions',
        'model_has_roles',
        'model_has_permissions',
        'users',
        'empresas',
    ];

    /** Catálogos oficiales que trae el sistema: no son datos de prueba. */
    private const CATALOGOS_FIJOS = [
        'ubigeos',
    ];

    /** Tablas del framework: no guardan datos del negocio. */
    private const DEL_FRAMEWORK = [
        'migrations',
        'cache',
        'cache_locks',
        'sessions',
        'jobs',
        'job_batches',
        'failed_jobs',
        'password_reset_tokens',
    ];

    public function handle(): int
    {
        $conexion = DB::connection();
        $config = $conexion->getConfig();

        if ($conexion->getDriverName() !== 'mysql') {
            $this->error('Este comando está pensado para MySQL/MariaDB.');

            return self::FAILURE;
        }

        $base = $conexion->getDatabaseName();
        $conservar = array_merge(self::CONSERVAR, self::CATALOGOS_FIJOS, self::DEL_FRAMEWORK);

        $tablas = collect(DB::select(
            'SELECT table_name AS nombre FROM information_schema.tables
             WHERE table_schema = ? AND table_type = ? ORDER BY table_name',
            [$base, 'BASE TABLE'],
        ))->pluck('nombre');

        $aBorrar = $tablas->reject(fn ($t) => in_array($t, $conservar, true))
            ->mapWithKeys(fn ($t) => [$t => DB::table($t)->count()]);
        $conservadas = $tablas->filter(fn ($t) => in_array($t, [...self::CONSERVAR, ...self::CATALOGOS_FIJOS], true))
            ->mapWithKeys(fn ($t) => [$t => DB::table($t)->count()]);

        $this->newLine();
        $this->warn("  Base de datos: {$base} en {$config['host']} · entorno ".app()->environment());
        $this->newLine();

        $this->line('  <fg=red;options=bold>Se BORRA todo esto</> ('.$aBorrar->count().' tablas, '.number_format($aBorrar->sum()).' filas):');
        $this->table(
            ['Tabla', 'Filas'],
            $aBorrar->filter()->map(fn ($n, $t) => [$t, number_format($n)])->values(),
        );
        $vacias = $aBorrar->filter(fn ($n) => $n === 0)->keys();
        if ($vacias->isNotEmpty()) {
            $this->line('  Ya vacías: '.$vacias->implode(', '));
        }

        $this->newLine();
        $this->line('  <fg=green;options=bold>Se CONSERVA</>: '.$conservadas->map(fn ($n, $t) => "{$t} ({$n})")->implode(', '));
        $this->line('  Luego se vuelven a sembrar limpios: unidades de medida, métodos de pago, motivos de movimiento y de traslado, y el tipo de precio principal.');
        $this->newLine();

        if ($this->option('simular')) {
            $this->info('  Simulación: no se borró nada.');

            return self::SUCCESS;
        }

        if (! $this->option('force')) {
            if (! $this->input->isInteractive()) {
                $this->error('Sin terminal para confirmar: usa --force.');

                return self::FAILURE;
            }

            $respuesta = $this->ask('Esto no se puede deshacer. Escribe LIMPIAR para continuar');
            if ($respuesta !== 'LIMPIAR') {
                $this->info('Cancelado: no se borró nada.');

                return self::SUCCESS;
            }
        }

        $this->borrar($aBorrar->keys()->all());

        $this->call('db:seed', ['--class' => CatalogosBaseSeeder::class, '--force' => true]);

        // Sembrar los catálogos también deja su rastro en la auditoría: se
        // vacía de nuevo para que arranque limpia.
        if ($aBorrar->has('auditorias')) {
            $this->borrar(['auditorias']);
        }

        // Lo guardado en caché (permisos, tableros) hablaba de datos que ya no existen.
        Cache::flush();
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $this->newLine();
        $this->info('  Listo: '.number_format($aBorrar->sum()).' filas borradas en '.$aBorrar->count().' tablas.');
        $this->line('  Conservado: '.$conservadas->map(fn ($n, $t) => "{$t} ({$n})")->implode(', '));
        if ($aBorrar->has('cajas')) {
            $this->line('  Los usuarios quedaron sin caja asignada: asígnala de nuevo al crear las cajas.');
        }

        return self::SUCCESS;
    }

    /** Vacía las tablas y reinicia sus contadores (los IDs vuelven a empezar en 1). */
    private function borrar(array $tablas): void
    {
        Schema::disableForeignKeyConstraints();

        try {
            foreach ($tablas as $tabla) {
                DB::table($tabla)->truncate();
            }
        } finally {
            Schema::enableForeignKeyConstraints();
        }
    }

}
