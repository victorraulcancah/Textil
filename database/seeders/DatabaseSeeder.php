<?php

namespace Database\Seeders;

use App\Models\Empresa;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $superAdmin = Role::firstOrCreate(['name' => 'super-admin']);
        Role::firstOrCreate(['name' => 'admin']);
        Role::firstOrCreate(['name' => 'user']);

        $empresa = Empresa::firstOrCreate(
            ['ruc' => '20123456789'],
            [
                'razon_social' => 'Textil S.A.C.',
                'nombre_comercial' => 'Textil',
                'direccion' => 'Av. Principal 123',
                'telefono' => '999888777',
                'email' => 'contacto@brother.com',
            ]
        );

        $user = User::firstOrCreate(
            ['email' => 'admin@brother.com'],
            [
                'name' => 'Super Admin',
                'password' => 'password',
                'empresa_id' => $empresa->id,
            ]
        );

        if (!$user->hasRole($superAdmin)) {
            $user->assignRole($superAdmin);
        }

        $this->call([
            MetodosPagoSeeder::class,
            MotivosMovimientoSeeder::class,
            CatalogSeeder::class,
            DemoSeeder::class,
            DashboardDemoSeeder::class,
        ]);
    }
}
