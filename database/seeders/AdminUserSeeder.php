<?php

namespace Database\Seeders;

use App\Models\Empresa;
use App\Models\User;
use Illuminate\Database\Seeder;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $empresa = Empresa::first();
        if (!$empresa) {
            $empresa = Empresa::create([
                'ruc' => '20123456789',
                'razon_social' => 'Brother Corp S.A.C.',
                'nombre_comercial' => 'Brother',
                'direccion' => 'Av. Principal 123',
                'telefono' => '999888777',
                'email' => 'contacto@brother.com',
            ]);
        }

        $user = User::create([
            'name' => 'Admin User',
            'email' => 'admin@test.com',
            'password' => 'password',
            'empresa_id' => $empresa->id,
        ]);

        $user->assignRole('admin');

        $this->command->info("Usuario admin creado: admin@test.com / password");
    }
}
