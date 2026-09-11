<?php
namespace App\Services;

use App\Models\AperturaCaja;
use App\Models\CuentaPorCobrar;
use App\Models\MotivoMovimiento;
use App\Models\MovimientoCaja;
use App\Models\NotaVenta;
use App\Models\NotaVentaDetalle;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Models\SerieDocumento;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Emitir, editar y anular notas de venta.
 *
 * Una venta toca tres cosas fuera de sí misma: descuenta stock, registra el
 * ingreso en caja y, si es al crédito, crea la cuenta por cobrar. Editar una
 * venta es deshacer las tres y volver a aplicarlas con los datos nuevos, todo
 * dentro de una transacción: si algo falla, no queda a medias.
 *
 * La tela, además, sale de un rollo concreto. En la venta de mostrador eso se
 * resuelve aquí: se corta el rollo elegido. En la que viene de un pedido ya lo
 * hizo el pedido al facturar, y aquí no se vuelve a cortar.
 */
class NotaVentaService
{
    public function __construct(
        protected StockService $stockService,
        protected RolloService $rollos,
    ) {}

    public function crear(array $data): NotaVenta
    {
        return DB::transaction(function () use ($data) {
            $serie = $data['serie'] ?? 'NV01';
            $serieDoc = SerieDocumento::where('tipo_documento', 'nota_venta')
                ->where('serie', $serie)
                ->lockForUpdate()
                ->firstOrCreate(
                    ['tipo_documento' => 'nota_venta', 'serie' => $serie],
                    ['numero_actual' => 0, 'activo' => true]
                );
            $serieDoc->increment('numero_actual');
            $numero = str_pad($serieDoc->numero_actual, 3, '0', STR_PAD_LEFT);

            $nota = NotaVenta::create($this->cabecera($data) + [
                'serie' => $serie,
                'numero' => $numero,
                'estado' => 'emitida',
            ]);

            $this->aplicar($nota, $data);

            return $this->conRelaciones($nota);
        });
    }

    /**
     * Edita una venta emitida: revierte lo que había y vuelve a aplicar.
     * Conserva serie y número — es el mismo documento corregido.
     */
    public function actualizar(NotaVenta $notaVenta, array $data): NotaVenta
    {
        if ($notaVenta->estado !== 'emitida') {
            throw new \InvalidArgumentException('Solo se pueden editar notas de venta emitidas.');
        }

        // Con cobros ya aplicados contra la cuenta por cobrar, revertir dejaría
        // esos pagos apuntando a una deuda que deja de existir.
        $cobrado = CuentaPorCobrar::where('nota_venta_id', $notaVenta->id)->sum('monto_pagado');
        if ((float) $cobrado > 0) {
            throw new \InvalidArgumentException(
                'Esta venta ya tiene cobros registrados en Cuentas por Cobrar. Anúlala y emite una nueva.'
            );
        }

        return DB::transaction(function () use ($notaVenta, $data) {
            $this->revertir($notaVenta);

            $notaVenta->detalles()->delete();
            $notaVenta->pagos()->delete();
            $notaVenta->update($this->cabecera($data));

            $this->aplicar($notaVenta->fresh(), $data);

            return $this->conRelaciones($notaVenta->fresh());
        });
    }

    public function anular(NotaVenta $notaVenta, string $motivo): NotaVenta
    {
        if ($notaVenta->estado !== 'emitida') {
            throw new \InvalidArgumentException('Solo se pueden anular notas de venta emitidas');
        }

        return DB::transaction(function () use ($notaVenta, $motivo) {
            $this->revertir($notaVenta, 'anulacion_nota_venta');

            $notaVenta->update([
                'estado' => 'anulada',
                'motivo_anulacion' => $motivo,
                'usuario_anula_id' => auth()->id(),
                'fecha_anulacion' => now(),
            ]);

            return $this->conRelaciones($notaVenta);
        });
    }

    /* ------------------------------------------------------------------ */

    /** Columnas propias de la venta (sin serie, número ni estado). */
    private function cabecera(array $data): array
    {
        return [
            'cliente_id' => $data['cliente_id'] ?? null,
            // Pedido del que nace la nota; null en una venta de mostrador.
            'orden_venta_id' => $data['orden_venta_id'] ?? null,
            'almacen_id' => $data['almacen_id'],
            'vendedor_id' => $data['vendedor_id'],
            'fecha_emision' => $data['fecha_emision'],
            'moneda' => $data['moneda'] ?? 'PEN',
            'tipo_pago' => $data['tipo_pago'] ?? 'contado',
            'subtotal' => $data['subtotal'],
            'descuento_total' => $data['descuento_total'] ?? 0,
            'total' => $data['total'],
            'observaciones' => $data['observaciones'] ?? null,
        ];
    }

    /** Crea líneas y pagos, descuenta stock, cobra en caja y genera la deuda. */
    private function aplicar(NotaVenta $nota, array $data): void
    {
        $nota->detalles()->createMany($data['detalles']);
        $nota->pagos()->createMany($data['pagos']);

        $nota->load(['detalles.presentacion.producto', 'detalles.rollo', 'almacen']);

        // La venta que viene de un pedido ya cortó sus rollos al facturar.
        $deMostrador = ! $nota->orden_venta_id;

        foreach ($nota->detalles as $detalle) {
            $rollo = $detalle->rollo;

            if ($deMostrador) {
                $this->exigirRollo($detalle, $nota);

                if ($rollo) {
                    $this->cortarRollo($rollo, $detalle, $nota);
                }
            }

            $this->stockService->salida(
                $detalle->presentacion,
                $nota->almacen,
                (float) $detalle->cantidad,
                0,
                'nota_venta',
                'nota_venta',
                $nota->id,
                auth()->id(),
                $data['fecha_emision'],
                colorId: $rollo?->producto_color_id,
            );
        }

        // El ingreso de caja va a la caja del vendedor (una caja pertenece a un usuario).
        $cajaId = User::find($data['vendedor_id'])?->caja_id;
        $apertura = $cajaId
            ? AperturaCaja::where('estado', 'abierta')
                ->where('caja_id', $cajaId)
                ->latest('fecha_apertura')
                ->first()
            : null;

        if ($apertura && $data['tipo_pago'] === 'contado') {
            // Sin motivo, el movimiento aparece con "—" en Mi Caja.
            $motivoVentaId = MotivoMovimiento::where('tipo', 'entrada')
                ->where('nombre', 'Ingreso por venta')
                ->value('id');

            foreach ($data['pagos'] as $pago) {
                MovimientoCaja::create([
                    'apertura_caja_id' => $apertura->id,
                    'tipo' => 'ingreso',
                    'motivo_movimiento_id' => $motivoVentaId,
                    'descripcion' => "Venta {$nota->serie}-{$nota->numero}",
                    'cuenta_bancaria_id' => ($pago['forma_pago'] ?? null) === 'transferencia' ? ($pago['cuenta_bancaria_id'] ?? null) : null,
                    'billetera_id' => ($pago['forma_pago'] ?? null) === 'billetera' ? ($pago['billetera_id'] ?? null) : null,
                    'monto' => $pago['monto'],
                    'fecha' => $pago['fecha'],
                    'numero_operacion' => $pago['referencia'] ?? null,
                    'documento_referencia_tipo' => 'nota_venta',
                    'documento_referencia_id' => $nota->id,
                ]);
            }
        }

        if ($data['tipo_pago'] === 'credito' && ($data['cliente_id'] ?? null)) {
            CuentaPorCobrar::create([
                'nota_venta_id' => $nota->id,
                'cliente_id' => $data['cliente_id'],
                'monto_total' => $data['total'],
                'monto_pagado' => 0,
                'saldo' => $data['total'],
                'fecha_vencimiento' => $data['fecha_emision'],
                'estado' => 'pendiente',
            ]);
        }
    }

    /** Deshace el efecto de la venta: devuelve stock, borra caja y deuda. */
    private function revertir(NotaVenta $nota, string $origen = 'edicion_nota_venta'): void
    {
        $nota->load(['detalles.presentacion.producto', 'detalles.rollo', 'almacen']);

        $deMostrador = ! $nota->orden_venta_id;

        foreach ($nota->detalles as $detalle) {
            $rollo = $detalle->rollo;

            // La tela vuelve al rollo del que se cortó, con su mismo código.
            if ($deMostrador && $rollo) {
                $this->rollos->devolver(
                    $rollo,
                    $detalle->presentacion->aMetros((float) $detalle->cantidad),
                    RolloMovimiento::CANCELACION,
                    'nota_venta',
                    $nota->id,
                    auth()->id(),
                );
            }

            $this->stockService->entrada(
                $detalle->presentacion,
                $nota->almacen,
                (float) $detalle->cantidad,
                0,
                $origen,
                'nota_venta',
                $nota->id,
                auth()->id(),
                now()->toDateTimeString(),
                colorId: $rollo?->producto_color_id,
            );
        }

        MovimientoCaja::where('documento_referencia_tipo', 'nota_venta')
            ->where('documento_referencia_id', $nota->id)
            ->delete();

        CuentaPorCobrar::where('nota_venta_id', $nota->id)->delete();
    }

    /**
     * Una tela que en este almacén se lleva por rollos no se puede vender
     * "a granel": hay que decir de qué rollo sale. Si no, los metros del
     * producto bajan y los de los rollos no, y los dos dejan de cuadrar.
     */
    private function exigirRollo(NotaVentaDetalle $detalle, NotaVenta $nota): void
    {
        $producto = $detalle->presentacion->producto;
        $rollo = $detalle->rollo;

        if (! $rollo) {
            $vaPorRollos = Rollo::where('producto_id', $producto->id)
                ->where('almacen_id', $nota->almacen_id)
                ->where('metros_actual', '>', 0)
                ->exists();

            if ($vaPorRollos) {
                throw new \DomainException(
                    "\"{$producto->nombre}\" se lleva por rollos en {$nota->almacen->nombre}: elige de qué rollo sale la tela."
                );
            }

            return;
        }

        if ((int) $rollo->producto_id !== (int) $producto->id) {
            throw new \DomainException("El rollo {$rollo->codigo} no es de \"{$producto->nombre}\".");
        }

        if ((int) $rollo->almacen_id !== (int) $nota->almacen_id) {
            throw new \DomainException("El rollo {$rollo->codigo} no está en {$nota->almacen->nombre}.");
        }

        if (! $rollo->estaDisponible()) {
            $estado = Rollo::ESTADOS[$rollo->estado] ?? $rollo->estado;

            throw new \DomainException("El rollo {$rollo->codigo} no está disponible: está {$estado}.");
        }
    }

    /**
     * Corta del rollo los metros de la línea. Si se lo lleva entero, el rollo
     * queda vendido y con el cliente como dueño, igual que al facturar un
     * pedido.
     */
    private function cortarRollo(Rollo $rollo, NotaVentaDetalle $detalle, NotaVenta $nota): void
    {
        $metros = $detalle->presentacion->aMetros((float) $detalle->cantidad);

        $this->rollos->cortar($rollo, $metros, RolloMovimiento::VENTA, 'nota_venta', $nota->id, auth()->id());

        $rollo = $rollo->fresh();

        if ((float) $rollo->metros_actual <= 0) {
            $this->rollos->cambiarEstado($rollo, Rollo::VENDIDO, RolloMovimiento::VENTA, 'nota_venta', $nota->id, auth()->id());
            $rollo->update(['cliente_id' => $nota->cliente_id]);
        }
    }

    private function conRelaciones(NotaVenta $nota): NotaVenta
    {
        return $nota->load([
            'cliente', 'almacen', 'vendedor',
            'detalles.presentacion.producto.marca', 'detalles.rollo.color', 'pagos.metodoPago',
        ]);
    }
}
