<?php

namespace Database\Seeders;

use App\Models\Almacen;
use App\Models\AperturaCaja;
use App\Models\Caja;
use App\Models\Cliente;
use App\Models\CuentaPorCobrar;
use App\Models\CuentaPorPagar;
use App\Models\MetodoPago;
use App\Models\MotivoMovimiento;
use App\Models\MovimientoCaja;
use App\Models\NotaVenta;
use App\Models\Producto;
use App\Models\ProductoAlmacenStock;
use App\Models\ProductoPresentacion;
use App\Models\Proveedor;
use App\Models\RecepcionCompra;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Datos falsos pensados para que el Dashboard se vea completo:
 * ventas repartidas en ~60 días, márgenes reales, movimientos de caja,
 * cuentas por cobrar/pagar y alertas de stock (bajo, quiebre y sin rotación).
 * Solo soles, sin IGV.
 */
class DashboardDemoSeeder extends Seeder
{
    public function run(): void
    {
        $almacen = Almacen::first();
        $vendedor = User::first();
        if (! $almacen || ! $vendedor) {
            return;
        }

        $productos = Producto::with('presentaciones')->get();
        if ($productos->isEmpty()) {
            return;
        }

        // Los 2 últimos productos quedan SIN vender (para el insight "sin rotación").
        $sinRotacion = $productos->slice(-2)->pluck('id')->all();

        // ── 1) Costo promedio por unidad base coherente + stock variado ──
        foreach ($productos->values() as $i => $p) {
            $pres = $p->presentaciones->first();
            if (! $pres) {
                continue;
            }
            $factor = (float) $pres->factor_conversion ?: 1;
            // Costo por unidad base ≈ 65% del precio de venta (deja ~35% de margen).
            $costoBase = round(((float) $pres->precio_venta / $factor) * 0.65, 6);

            $stock = match (true) {
                in_array($p->id, $sinRotacion, true) => rand(60, 120), // con stock, sin ventas
                $i % 5 === 0 => 0,                                     // quiebre
                $i % 5 === 1 => rand(1, 10),                           // bajo stock
                default => rand(30, 180),
            };

            ProductoAlmacenStock::updateOrCreate(
                ['producto_id' => $p->id, 'almacen_id' => $almacen->id],
                [
                    'stock_actual' => $stock,
                    'stock_anterior' => 0,
                    'stock_reservado' => 0,
                    'stock_disponible' => $stock,
                    'costo_promedio' => $costoBase,
                    'stock_minimo' => 15,
                    'stock_maximo' => 500,
                ]
            );
        }

        // ── 2) Ventas repartidas en ~60 días ──
        $vendibles = ProductoPresentacion::with('producto')
            ->whereNotIn('producto_id', $sinRotacion)
            ->get();
        $clientes = Cliente::all();
        $numero = 0;

        for ($n = 0; $n < 140; $n++) {
            $fecha = now()->subDays(rand(0, 59))->setTime(rand(8, 20), rand(0, 59));
            $tipoPago = rand(1, 100) <= 70 ? 'contado' : 'credito';
            $cliente = rand(1, 100) <= 75 || $tipoPago === 'credito' ? $clientes->random() : null;

            $detalles = [];
            $subtotal = 0;
            foreach (range(1, rand(1, 4)) as $l) {
                $pres = $vendibles->random();
                $cant = rand(1, 12);
                $precio = (float) $pres->precio_venta ?: (float) ($pres->producto->precio_base ?? 1);
                $sub = round($cant * $precio, 2);
                $detalles[] = [
                    'producto_presentacion_id' => $pres->id,
                    'cantidad' => $cant,
                    'precio_unitario' => $precio,
                    'descuento' => 0,
                    'subtotal' => $sub,
                ];
                $subtotal += $sub;
            }
            $subtotal = round($subtotal, 2);
            $numero++;

            $nota = NotaVenta::create([
                'serie' => 'NV01',
                'numero' => str_pad((string) $numero, 4, '0', STR_PAD_LEFT),
                'cliente_id' => $cliente?->id,
                'almacen_id' => $almacen->id,
                'vendedor_id' => $vendedor->id,
                'fecha_emision' => $fecha->toDateString(),
                'moneda' => 'PEN',
                'tipo_pago' => $tipoPago,
                'subtotal' => $subtotal,
                'descuento_total' => 0,
                'total' => $subtotal,
                'estado' => 'emitida',
                'created_at' => $fecha,
                'updated_at' => $fecha,
            ]);
            $nota->detalles()->createMany($detalles);

            if ($tipoPago === 'credito' && $cliente) {
                $pagado = rand(0, 1) ? round($subtotal * 0.4, 2) : 0;
                CuentaPorCobrar::create([
                    'nota_venta_id' => $nota->id,
                    'cliente_id' => $cliente->id,
                    'monto_total' => $subtotal,
                    'monto_pagado' => $pagado,
                    'saldo' => round($subtotal - $pagado, 2),
                    'fecha_vencimiento' => $fecha->copy()->addDays(30)->toDateString(),
                    'estado' => $pagado > 0 ? 'parcial' : 'pendiente',
                ]);
            }
        }

        // ── 3) Movimientos de caja (últimos 30 días) ──
        $caja = Caja::first();
        if ($caja) {
            $apertura = AperturaCaja::create([
                'caja_id' => $caja->id,
                'usuario_id' => $vendedor->id,
                'monto_inicial' => 200,
                'fecha_apertura' => now()->subDays(30),
                'estado' => 'abierta',
            ]);
            // Motivos de CAJA (no de inventario): ingreso = entrada; egreso = gasto operativo.
            $motIngreso = MotivoMovimiento::where('ambito', 'caja')->where('tipo', 'entrada')->first();
            $motGasto = MotivoMovimiento::where('ambito', 'caja')->where('categoria_gasto', 'operativo')->get();
            $metodo = MetodoPago::where('nombre', 'Efectivo')->first() ?? MetodoPago::first();

            for ($m = 0; $m < 50; $m++) {
                $ingreso = rand(1, 100) <= 60;
                MovimientoCaja::create([
                    'apertura_caja_id' => $apertura->id,
                    'tipo' => $ingreso ? 'ingreso' : 'egreso',
                    'motivo_movimiento_id' => $ingreso ? $motIngreso?->id : ($motGasto->isNotEmpty() ? $motGasto->random()->id : null),
                    'metodo_pago_id' => $metodo?->id,
                    'monto' => $ingreso ? rand(50, 600) : rand(20, 300),
                    'fecha' => now()->subDays(rand(0, 29))->toDateString(),
                ]);
            }
        }

        // ── 4) Cuentas por pagar (con recepciones mínimas) ──
        foreach (Proveedor::take(5)->get() as $prov) {
            $recepcion = RecepcionCompra::create([
                'proveedor_id' => $prov->id,
                'almacen_id' => $almacen->id,
                'fecha_recepcion' => now()->subDays(rand(5, 40)),
                'estado' => 'completa',
                'stock_aplicado' => true,
                'usuario_recibe_id' => $vendedor->id,
            ]);
            $total = rand(300, 3000);
            $pagado = rand(0, 1) ? round($total * 0.5, 2) : 0;
            CuentaPorPagar::create([
                'recepcion_compra_id' => $recepcion->id,
                'proveedor_id' => $prov->id,
                'monto_total' => $total,
                'monto_pagado' => $pagado,
                'saldo' => round($total - $pagado, 2),
                'fecha_vencimiento' => now()->addDays(rand(5, 45))->toDateString(),
                'estado' => $pagado > 0 ? 'parcial' : 'pendiente',
            ]);
        }
    }
}
