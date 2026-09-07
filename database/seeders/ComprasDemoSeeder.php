<?php

namespace Database\Seeders;

use App\Models\Almacen;
use App\Models\Compra;
use App\Models\CuentaPorPagar;
use App\Models\OrdenCompra;
use App\Models\Producto;
use App\Models\ProductoPresentacion;
use App\Models\Proveedor;
use App\Models\RecepcionCompra;
use App\Models\SerieDocumento;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Datos de ejemplo del circuito de compras: órdenes → compras → recepciones.
 *
 * Reutiliza StockService y los mismos correlativos que los controladores, así
 * que el stock, el costo promedio y el kardex quedan iguales que si se hubiera
 * registrado todo a mano desde la aplicación.
 *
 * Deja el circuito en sus distintos estados para poder probar la interfaz:
 * órdenes pendientes y ya convertidas en compra, compras al contado y al
 * crédito (con su cuenta por pagar), y recepciones totales, parciales y
 * pendientes.
 *
 *   php artisan db:seed --class=ComprasDemoSeeder
 */
class ComprasDemoSeeder extends Seeder
{
    public function run(): void
    {
        $proveedores = Proveedor::orderBy('id')->get();
        $presentaciones = ProductoPresentacion::with('producto')
            ->whereHas('producto')
            ->orderBy('id')
            ->get();
        $almacen = Almacen::where('tipo', 'principal')->first() ?? Almacen::first();
        $usuario = User::orderBy('id')->first();

        if ($proveedores->isEmpty() || $presentaciones->isEmpty() || ! $almacen) {
            $this->command?->warn('Faltan proveedores, productos o almacenes: corre antes TextilCatalogSeeder.');

            return;
        }

        // Las presentaciones que se compran por bulto (rollo, cono) son las que
        // tienen sentido en una compra al proveedor.
        $compraPresentaciones = $presentaciones
            ->filter(fn ($p) => str_contains(mb_strtolower($p->nombre), 'rollo')
                || str_contains(mb_strtolower($p->nombre), 'docena')
                || str_contains(mb_strtolower($p->nombre), 'cono'))
            ->values();

        if ($compraPresentaciones->isEmpty()) {
            $compraPresentaciones = $presentaciones;
        }

        $ordenes = $this->crearOrdenes($proveedores, $compraPresentaciones, $usuario);
        $compras = $this->crearCompras($proveedores, $compraPresentaciones, $ordenes, $usuario);
        $recepciones = $this->crearRecepciones($compras, $almacen, $usuario);

        $this->command?->info(sprintf(
            'Compras demo: %d órdenes, %d compras, %d recepciones.',
            count($ordenes), count($compras), $recepciones,
        ));
    }

    /** Órdenes de compra: algunas quedan pendientes, otras pasarán a compra. */
    private function crearOrdenes($proveedores, $presentaciones, ?User $usuario): array
    {
        $ordenes = [];

        // [proveedor, días atrás, entrega en días, nº de líneas, estado]
        $plan = [
            [0, 25, 7, 3, 'aprobada'],
            [1, 20, 10, 2, 'aprobada'],
            [2, 14, 5, 4, 'aprobada'],
            [3, 9, 12, 2, 'pendiente'],
            [4, 4, 15, 3, 'pendiente'],
        ];

        foreach ($plan as $i => [$idxProv, $diasAtras, $entrega, $lineas, $estado]) {
            $proveedor = $proveedores[$idxProv % $proveedores->count()];
            $fecha = now()->subDays($diasAtras);

            $orden = OrdenCompra::create([
                'codigo' => $this->correlativoOrden(),
                'proveedor_id' => $proveedor->id,
                'fecha_emision' => $fecha,
                'fecha_entrega_estimada' => $fecha->copy()->addDays($entrega),
                'estado' => $estado,
                'usuario_crea_id' => $usuario?->id,
                'condicion_pago' => $i % 2 === 0 ? 'credito' : 'contado',
                'moneda' => 'PEN',
                'tipo_cambio' => 1,
                'observaciones' => $i === 4 ? 'Reposición de temporada.' : null,
            ]);

            foreach ($this->tomarLineas($presentaciones, $lineas, $i) as $linea) {
                $orden->detalles()->create([
                    'producto_presentacion_id' => $linea['presentacion']->id,
                    'cantidad' => $linea['cantidad'],
                    'precio_unitario' => $linea['costo'],
                    'descuento' => 0,
                    'subtotal' => round($linea['cantidad'] * $linea['costo'], 2),
                ]);
            }

            $ordenes[] = $orden;
        }

        return $ordenes;
    }

    /** Compras: al contado y al crédito, algunas nacidas de una orden. */
    private function crearCompras($proveedores, $presentaciones, array $ordenes, ?User $usuario): array
    {
        $compras = [];

        // [proveedor, días atrás, forma de pago, nº líneas, orden asociada, pagada]
        $plan = [
            [0, 22, 'contado', 3, 0, true],
            [1, 18, 'credito', 2, 1, false],
            [2, 12, 'credito', 4, 2, true],
            [3, 8, 'contado', 2, null, true],
            [4, 5, 'credito', 3, null, false],
            [0, 2, 'contado', 2, null, true],
        ];

        foreach ($plan as $i => [$idxProv, $diasAtras, $formaPago, $lineas, $idxOrden, $pagada]) {
            $proveedor = $proveedores[$idxProv % $proveedores->count()];
            $fecha = now()->subDays($diasAtras);
            $orden = $idxOrden !== null ? ($ordenes[$idxOrden] ?? null) : null;

            $detalles = $this->tomarLineas($presentaciones, $lineas, $i + 3);
            $subtotal = collect($detalles)->sum(fn ($d) => round($d['cantidad'] * $d['costo'], 2));
            $flete = $i % 3 === 0 ? 35.00 : 0.0;
            $total = round($subtotal + $flete, 2);

            $compra = Compra::create([
                'correlativo' => $this->correlativoCompra(),
                'proveedor_id' => $proveedor->id,
                'orden_compra_id' => $orden?->id,
                'tipo_documento' => $i % 4 === 3 ? 'boleta' : 'factura',
                'serie' => $i % 4 === 3 ? 'B001' : 'F001',
                'numero' => str_pad((string) (1200 + $i * 37), 6, '0', STR_PAD_LEFT),
                'guia' => 'G001-'.str_pad((string) (500 + $i), 5, '0', STR_PAD_LEFT),
                'fecha' => $fecha,
                'forma_pago' => $formaPago,
                'dias_credito' => $formaPago === 'credito' ? 30 : 0,
                'fecha_vencimiento' => $formaPago === 'credito' ? $fecha->copy()->addDays(30) : null,
                'flete' => $flete,
                'subtotal' => $subtotal,
                'total' => $total,
                'estado' => 'registrada',
                'observaciones' => $i === 2 ? 'Mercadería para campaña escolar.' : null,
                'usuario_id' => $usuario?->id,
            ]);

            foreach ($detalles as $d) {
                $compra->detalles()->create([
                    'producto_presentacion_id' => $d['presentacion']->id,
                    'cantidad' => $d['cantidad'],
                    'costo_unitario' => $d['costo'],
                    'subtotal' => round($d['cantidad'] * $d['costo'], 2),
                ]);
            }

            // Al contado se paga todo; al crédito, un adelanto en la mitad de los casos.
            if ($formaPago === 'contado') {
                $compra->pagos()->create(['metodo' => 'efectivo', 'monto' => $total]);
            } elseif ($pagada) {
                $compra->pagos()->create([
                    'metodo' => 'transferencia',
                    'monto' => round($total * 0.4, 2),
                ]);
            }

            $this->sincronizarCuentaPorPagar($compra->fresh());

            // La orden que originó la compra queda marcada como recibida.
            $orden?->update(['estado' => 'recibida']);

            $compras[] = $compra->fresh('detalles');
        }

        return $compras;
    }

    /**
     * Recepciones: totales, parciales y alguna compra sin recibir todavía.
     * El ingreso al almacén pasa por StockService, igual que en la aplicación.
     */
    private function crearRecepciones(array $compras, Almacen $almacen, ?User $usuario): int
    {
        $stock = app(StockService::class);
        $creadas = 0;

        // Porción de lo pedido que llega en esta recepción, por compra.
        $porciones = [1.0, 0.5, 1.0, 0.6, null, null];

        foreach ($compras as $i => $compra) {
            $porcion = $porciones[$i] ?? null;
            if ($porcion === null) {
                continue; // Queda pendiente de recepción.
            }

            DB::transaction(function () use ($compra, $almacen, $usuario, $stock, $porcion, &$creadas) {
                $recepcion = RecepcionCompra::create([
                    'compra_id' => $compra->id,
                    'orden_compra_id' => $compra->orden_compra_id,
                    'proveedor_id' => $compra->proveedor_id,
                    'almacen_id' => $almacen->id,
                    'serie' => RecepcionCompra::SERIE,
                    'numero' => $this->correlativoRecepcion(),
                    'numero_documento' => $compra->serie.'-'.$compra->numero,
                    'tipo_documento' => $compra->tipo_documento,
                    'fecha_recepcion' => $compra->fecha->copy()->addDays(2),
                    'estado' => 'parcial',
                    'activo' => true,
                    'stock_aplicado' => true,
                    'usuario_recibe_id' => $usuario?->id,
                    'observaciones' => $porcion < 1 ? 'Entrega parcial del proveedor.' : null,
                ]);

                foreach ($compra->detalles as $linea) {
                    $cantidad = round((float) $linea->cantidad * $porcion, 2);
                    if ($cantidad <= 0) {
                        continue;
                    }

                    $presentacion = ProductoPresentacion::find($linea->producto_presentacion_id);
                    $factor = (float) $presentacion->factor_conversion ?: 1;
                    // StockService valoriza en unidad base; el costo es por presentación.
                    $costoBase = $factor > 0 ? (float) $linea->costo_unitario / $factor : (float) $linea->costo_unitario;

                    $movimiento = $stock->entrada(
                        $presentacion, $almacen, $cantidad, $costoBase,
                        'recepcion', 'recepcion_compra', $recepcion->id, $usuario?->id,
                    );

                    $recepcion->detalles()->create([
                        'compra_detalle_id' => $linea->id,
                        'producto_presentacion_id' => $presentacion->id,
                        'cantidad_pedida' => (float) $linea->cantidad,
                        'cantidad_ordenada' => (float) $linea->cantidad,
                        'cantidad_recibida' => $cantidad,
                        'cantidad_conforme' => $cantidad,
                        'cantidad_rechazada' => 0,
                        'costo_unitario' => (float) $linea->costo_unitario,
                        'stock_anterior' => (float) $movimiento->stock_anterior,
                        'stock_nuevo' => (float) $movimiento->saldo_stock,
                    ]);
                }

                // Estados: completa si llegó todo, parcial si falta algo.
                $recibido = $recepcion->detalles()->sum('cantidad_recibida');
                $pedido = $compra->detalles->sum('cantidad');

                $recepcion->update([
                    'estado' => $recibido + 0.001 >= $pedido ? 'completa' : 'parcial',
                ]);
                $compra->update([
                    'estado' => $recibido + 0.001 >= $pedido ? 'recepcionada' : 'parcial',
                ]);

                $creadas++;
            });
        }

        return $creadas;
    }

    /**
     * Líneas de ejemplo: presentaciones distintas con cantidades y costos
     * verosímiles. `salto` reparte los productos entre documentos.
     */
    private function tomarLineas($presentaciones, int $cuantas, int $salto): array
    {
        $total = $presentaciones->count();
        $lineas = [];

        for ($i = 0; $i < $cuantas; $i++) {
            $presentacion = $presentaciones[($salto * 3 + $i * 2) % $total];

            // Costo: el de la presentación si lo tiene; si no, se estima.
            $costo = (float) $presentacion->precio_compra;
            if ($costo <= 0) {
                $costo = round(max((float) $presentacion->precio_venta * 0.65, 5), 2);
            }

            $lineas[] = [
                'presentacion' => $presentacion,
                'cantidad' => [2, 3, 5, 8, 10][($salto + $i) % 5],
                'costo' => $costo,
            ];
        }

        return $lineas;
    }

    /** Mismos correlativos que usan los controladores. */
    private function correlativoOrden(): string
    {
        $serie = $this->serie('orden_compra', 'OC0001');

        return 'OC0001-'.str_pad((string) $serie->numero_actual, 8, '0', STR_PAD_LEFT);
    }

    private function correlativoCompra(): int
    {
        return $this->serie('compra', Compra::SERIE_INTERNA)->numero_actual;
    }

    private function correlativoRecepcion(): string
    {
        return str_pad((string) $this->serie('recepcion_almacen', RecepcionCompra::SERIE)->numero_actual, 4, '0', STR_PAD_LEFT);
    }

    /** Avanza el correlativo de la serie y la devuelve. */
    private function serie(string $tipo, string $serie): SerieDocumento
    {
        $doc = SerieDocumento::firstOrCreate(
            ['tipo_documento' => $tipo, 'serie' => $serie],
            ['numero_actual' => 0, 'activo' => true],
        );

        $doc->increment('numero_actual');

        return $doc->fresh();
    }

    /** Misma regla que CompraController: el crédito deja deuda con el proveedor. */
    private function sincronizarCuentaPorPagar(Compra $compra): void
    {
        if ($compra->forma_pago !== 'credito' || ! $compra->proveedor_id) {
            return;
        }

        $total = round((float) $compra->total, 2);
        $pagado = round((float) $compra->pagos()->sum('monto'), 2);
        $saldo = round(max($total - $pagado, 0), 2);

        CuentaPorPagar::create([
            'compra_id' => $compra->id,
            'proveedor_id' => $compra->proveedor_id,
            'monto_total' => $total,
            'monto_pagado' => $pagado,
            'saldo' => $saldo,
            'fecha_vencimiento' => $compra->fecha_vencimiento ?? $compra->fecha->copy()->addDays(30),
            'estado' => $saldo <= 0 ? 'pagada' : ($pagado > 0 ? 'parcial' : 'pendiente'),
        ]);
    }
}
