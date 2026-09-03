<?php

namespace Database\Seeders;

use App\Models\MetodoPago;
use Illuminate\Database\Seeder;

class MetodosPagoSeeder extends Seeder
{
    public function run(): void
    {
        $metodos = [
            ['nombre' => 'Efectivo', 'tipo' => 'efectivo', 'es_sistema' => true],
            ['nombre' => 'Transferencia', 'tipo' => 'banco', 'es_sistema' => false, 'requiere_cuenta_bancaria' => true, 'requiere_numero_operacion' => true],
            ['nombre' => 'Yape', 'tipo' => 'billetera', 'es_sistema' => false, 'requiere_numero_operacion' => true],
            ['nombre' => 'Plin', 'tipo' => 'billetera', 'es_sistema' => false, 'requiere_numero_operacion' => true],
        ];
        // Nota: los 3 tipos de método son efectivo, transferencia (banco) y billetera.
        // "Tarjeta" no se maneja como método de pago en este sistema.

        foreach ($metodos as $m) {
            MetodoPago::updateOrCreate(
                ['nombre' => $m['nombre']],
                array_merge($m, ['activo' => true])
            );
        }
    }
}
