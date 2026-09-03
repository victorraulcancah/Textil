<?php

namespace Database\Seeders;

use App\Models\Almacen;
use App\Models\Banco;
use App\Models\BilleteraDigital;
use App\Models\Caja;
use App\Models\Cliente;
use App\Models\CuentaBancaria;
use App\Models\ProductoPresentacion;
use App\Models\TarjetaBancaria;
use App\Services\StockService;
use Illuminate\Database\Seeder;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        // ── Clientes ──
        $clientes = [
            ['nombre' => 'María Quispe Huamán', 'tipo_documento' => 'DNI', 'numero_documento' => '45678912', 'telefono' => '987654321', 'email' => 'maria.quispe@gmail.com', 'direccion' => 'Jr. Los Olivos 234'],
            ['nombre' => 'Bodega El Ahorro E.I.R.L.', 'tipo_documento' => 'RUC', 'numero_documento' => '20456789123', 'telefono' => '01-4567890', 'email' => 'ventas@elahorro.com', 'direccion' => 'Av. Grau 890'],
            ['nombre' => 'José Carlos Mendoza', 'tipo_documento' => 'DNI', 'numero_documento' => '41258963', 'telefono' => '999112233', 'email' => 'jcmendoza@hotmail.com', 'direccion' => 'Calle Las Flores 45'],
            ['nombre' => 'Minimarket Sofía S.A.C.', 'tipo_documento' => 'RUC', 'numero_documento' => '20512345678', 'telefono' => '01-3216548', 'email' => 'compras@sofiamarket.pe', 'direccion' => 'Av. Perú 1234'],
            ['nombre' => 'Rosa Torres Vega', 'tipo_documento' => 'DNI', 'numero_documento' => '48521479', 'telefono' => '955443322', 'email' => 'rosat@gmail.com', 'direccion' => 'Psje. San Martín 12'],
            ['nombre' => 'Luis Ramírez Soto', 'tipo_documento' => 'DNI', 'numero_documento' => '43217896', 'telefono' => '966778899', 'email' => null, 'direccion' => 'Mz. B Lote 7'],
            ['nombre' => 'Distribuidora Andina S.R.L.', 'tipo_documento' => 'RUC', 'numero_documento' => '20548796321', 'telefono' => '01-7894561', 'email' => 'info@andina.com', 'direccion' => 'Av. Industrial 456'],
            ['nombre' => 'Cliente Público General', 'tipo_documento' => 'SIN', 'numero_documento' => null, 'telefono' => null, 'email' => null, 'direccion' => null],
        ];
        foreach ($clientes as $c) {
            Cliente::create(array_merge($c, ['activo' => true]));
        }

        // ── Bancos ──
        $bancosData = ['BCP', 'Interbank', 'BBVA', 'Scotiabank'];
        $bancos = [];
        foreach ($bancosData as $nombre) {
            $bancos[$nombre] = Banco::create(['nombre' => $nombre, 'activo' => true]);
        }

        // ── Cuentas bancarias ──
        $cuentas = [];
        $cuentas[] = CuentaBancaria::create([
            'banco_id' => $bancos['BCP']->id, 'alias' => 'Cuenta principal soles', 'numero_cuenta' => '191-1234567-0-88',
            'cci' => '00219100123456708812', 'titular' => 'Brother Corp S.A.C.', 'moneda' => 'PEN', 'tipo_cuenta' => 'corriente', 'activo' => true,
        ]);
        $cuentas[] = CuentaBancaria::create([
            'banco_id' => $bancos['Interbank']->id, 'alias' => 'Ahorros negocio', 'numero_cuenta' => '200-3009876543',
            'cci' => '00320000300987654399', 'titular' => 'Brother Corp S.A.C.', 'moneda' => 'PEN', 'tipo_cuenta' => 'ahorros', 'activo' => true,
        ]);
        $cuentas[] = CuentaBancaria::create([
            'banco_id' => $bancos['BBVA']->id, 'alias' => 'Cuenta pagos proveedores', 'numero_cuenta' => '0011-0456-0200123456',
            'cci' => '01104560020012345678', 'titular' => 'Brother Corp S.A.C.', 'moneda' => 'PEN', 'tipo_cuenta' => 'corriente', 'activo' => true,
        ]);

        // ── Tarjetas ──
        TarjetaBancaria::create([
            'cuenta_bancaria_id' => $cuentas[0]->id, 'tipo_tarjeta' => 'debito', 'nombre_referencial' => 'Débito BCP negocio',
            'numero_enmascarado' => '4557', 'marca' => 'Visa', 'fecha_vencimiento' => '08/2028', 'titular' => 'Brother Corp', 'estado' => 'activa',
        ]);
        TarjetaBancaria::create([
            'cuenta_bancaria_id' => $cuentas[2]->id, 'tipo_tarjeta' => 'credito', 'nombre_referencial' => 'Crédito BBVA',
            'numero_enmascarado' => '5211', 'marca' => 'Mastercard', 'fecha_vencimiento' => '03/2027', 'titular' => 'Brother Corp', 'limite_credito' => 15000, 'estado' => 'activa',
        ]);

        // ── Billeteras digitales ──
        BilleteraDigital::create([
            'nombre' => 'Yape', 'numero_asociado' => '987654321', 'cuenta_bancaria_id' => $cuentas[0]->id,
            'titular' => 'Brother Corp', 'requiere_captura' => true, 'activo' => true,
        ]);
        BilleteraDigital::create([
            'nombre' => 'Plin', 'numero_asociado' => '955443322', 'cuenta_bancaria_id' => $cuentas[1]->id,
            'titular' => 'Brother Corp', 'requiere_captura' => false, 'activo' => true,
        ]);

        // ── Cajas (se asignan a usuarios; aceptan efectivo + cuentas + billeteras) ──
        $cajaPrincipal = Caja::create(['nombre' => 'Caja Principal', 'acepta_efectivo' => true, 'activo' => true]);
        $cajaPrincipal->cuentasBancarias()->sync(\App\Models\CuentaBancaria::pluck('id'));
        $cajaPrincipal->billeteras()->sync(\App\Models\BilleteraDigital::pluck('id'));
        Caja::create(['nombre' => 'Caja Tienda', 'acepta_efectivo' => true, 'activo' => true]);

        // Asignar la caja principal al admin (para "Mi Caja" y ventas al contado).
        \App\Models\User::where('email', 'admin@brother.com')->update(['caja_id' => $cajaPrincipal->id]);

        // ── Movimientos de inventario demo (para poblar el Kardex valorizado) ──
        $almacen = Almacen::first();
        if ($almacen) {
            $stock = app(StockService::class);
            $presentaciones = ProductoPresentacion::with('producto')->take(6)->get();

            foreach ($presentaciones as $pres) {
                $costoCompra = round((float) ($pres->producto->precio_base ?? 5) * 0.6, 2);

                // Entrada por compra (con costo real → alimenta el promedio ponderado)
                $stock->entrada(
                    $pres, $almacen, rand(10, 40), $costoCompra,
                    'compra', 'recepcion_compra', null, null,
                    now()->subDays(5)->toDateTimeString()
                );

                // Salida por venta
                $stock->salida(
                    $pres, $almacen, rand(1, 8), 0,
                    'nota_venta', 'nota_venta', null, null,
                    now()->subDays(2)->toDateTimeString()
                );
            }
        }
    }
}
