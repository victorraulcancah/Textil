<?php

namespace Database\Seeders;

use App\Models\Empresa;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

/**
 * Datos mínimos para arrancar en PRODUCCIÓN: roles, empresa, usuario
 * administrador y los catálogos base del sistema (métodos de pago y motivos de
 * movimiento). NO carga datos de demostración.
 *
 * A diferencia de DatabaseSeeder (que llama a DemoSeeder / DashboardDemoSeeder
 * con clientes, ventas y stock de prueba), este seeder es seguro para una
 * instalación real y se puede volver a ejecutar sin duplicar nada.
 *
 * Uso:
 *   php artisan db:seed --class=ProductionSeeder --force
 *
 * Datos de la empresa y del administrador, configurables por .env:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME,
 *   EMPRESA_RUC, EMPRESA_RAZON_SOCIAL, EMPRESA_NOMBRE_COMERCIAL
 *
 * Si no se define ADMIN_PASSWORD se genera una aleatoria y se muestra en
 * pantalla una sola vez.
 *
 * IMPORTANTE: ejecutarlo ANTES de `php artisan config:cache`. Con la
 * configuración cacheada Laravel no lee el archivo .env, así que env() aquí
 * devolvería los valores por defecto. Si ya cacheaste, pasa las variables en la
 * misma línea:
 *   ADMIN_EMAIL=jefe@empresa.com php artisan db:seed --class=ProductionSeeder --force
 */
class ProductionSeeder extends Seeder
{
    public function run(): void
    {
        // ── Roles ──
        $superAdmin = Role::firstOrCreate(['name' => 'super-admin', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'user', 'guard_name' => 'web']);

        // ── Empresa ──
        $empresa = Empresa::activa() ?? Empresa::firstOrCreate(
            ['ruc' => env('EMPRESA_RUC', '20123456789')],
            [
                'razon_social' => env('EMPRESA_RAZON_SOCIAL', 'Mi Empresa S.A.C.'),
                'nombre_comercial' => env('EMPRESA_NOMBRE_COMERCIAL', 'Mi Empresa'),
                'activa' => true,
            ]
        );

        // ── Usuario administrador ──
        $email = env('ADMIN_EMAIL', 'admin@brother.com');
        $generada = null;
        $user = User::where('email', $email)->first();

        if (! $user) {
            $password = env('ADMIN_PASSWORD');
            if (blank($password)) {
                $generada = Str::password(16);
                $password = $generada;
            }

            $user = User::create([
                'name' => env('ADMIN_NAME', 'Administrador'),
                'email' => $email,
                'password' => $password,
                'empresa_id' => $empresa->id,
            ]);
        }

        if (! $user->hasRole($superAdmin)) {
            $user->assignRole($superAdmin);
        }

        // ── Catálogos base del sistema (idempotentes) ──
        $this->call([
            UnidadesMedidaSeeder::class,
            MetodosPagoSeeder::class,
            MotivosMovimientoSeeder::class,
        ]);

        $this->command?->info("Empresa: {$empresa->razon_social} (RUC {$empresa->ruc})");
        $this->command?->info("Administrador: {$email}");

        if ($generada) {
            $this->command?->warn("Contraseña generada (anótala ahora, no se vuelve a mostrar): {$generada}");
        } else {
            $this->command?->info('Contraseña: la definida en ADMIN_PASSWORD (o la que ya tenía el usuario).');
        }
    }
}
