<?php
namespace App\Services;

use App\Models\AperturaCaja;
use App\Models\Cliente;
use App\Models\CuentaPorCobrar;
use App\Models\LineaCredito;
use App\Models\MotivoMovimiento;
use App\Models\MovimientoCaja;
use App\Models\NotaVenta;
use App\Models\NotaVentaDetalle;
use App\Models\OrdenVenta;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Models\SerieDocumento;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * Emitir, editar y anular notas de venta.
 *
 * Una venta toca tres cosas fuera de sí misma: descuenta stock, registra el
 * ingreso en caja y, si es al crédito, crea la cuenta por cobrar de cada
 * cuota (antes comprueba que quepa en la línea de crédito del cliente). Editar una
 * venta es deshacer las tres y volver a aplicarlas con los datos nuevos, todo
 * dentro de una transacción: si algo falla, no queda a medias.
 *
 * La tela, además, sale de un rollo concreto. En la venta de mostrador eso se
 * resuelve aquí: se corta el rollo elegido y se descuenta el stock. En la que
 * viene de un pedido ya lo hizo el pedido al despachar, así que aquí solo se
 * registra la venta y el cobro; anularla devuelve la tela por el pedido.
 */
class NotaVentaService
{
    public function __construct(
        protected StockService $stockService,
        protected RolloService $rollos,
        protected CreditoService $credito,
        protected TipoCambioService $tiposCambio,
    ) {}

    public function crear(array $data): NotaVenta
    {
        return DB::transaction(function () use ($data) {
            $data = $this->conTipoCambio($data);
            $this->verificarCredito($data);

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

        // La nota de un pedido es el reflejo de lo que se despachó: cambiarla
        // aparte dejaría la venta y la salida de tela sin cuadrar.
        if ($notaVenta->orden_venta_id) {
            throw new \InvalidArgumentException(
                'Esta venta viene de un pedido y no se edita por separado. Anúlala y vuelve a facturar el pedido.'
            );
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
            $data = $this->conTipoCambio($data);

            $this->revertir($notaVenta);
            // Ya sin la deuda de esta misma venta: lo que cuenta es lo demás.
            $this->verificarCredito($data);

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
            'tipo_cambio' => $data['tipo_cambio'] ?? null,
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

        $cobros = array_map(fn ($pago) => $this->cobroDe($pago, $nota->moneda), $data['pagos']);
        $nota->pagos()->createMany($cobros);

        // Cobrada con soles: ese tipo de cambio queda como el comercial del día.
        foreach ($cobros as $cobro) {
            if ($cobro['monto_pen'] !== null) {
                $this->tiposCambio->recordarComercial((float) $cobro['tipo_cambio'], $cobro['fecha'] ?? null);
            }
        }

        $nota->load(['detalles.presentacion.producto', 'detalles.rollo', 'almacen']);

        // La venta que viene de un pedido ya cortó sus rollos y descontó el
        // stock al despachar: aquí no se vuelve a mover nada.
        $deMostrador = ! $nota->orden_venta_id;

        foreach ($nota->detalles as $detalle) {
            if (! $deMostrador) {
                continue;
            }

            $rollo = $detalle->rollo;

            $this->exigirRollo($detalle, $nota);

            if ($rollo) {
                // Lo que medía el rollo al venderlo y si se fue entero o fue
                // un corte: es lo que la nota muestra en cada fila.
                $metros = $detalle->presentacion->aMetros((float) $detalle->cantidad);
                $detalle->update([
                    'metros_rollo' => (float) $rollo->metros_actual,
                    'rollo_entero' => $metros + 0.001 >= (float) $rollo->metros_actual,
                ]);

                $this->cortarRollo($rollo, $detalle, $nota);
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

            foreach ($cobros as $pago) {
                // La plata que de verdad entró: cobrada en soles, en soles; si
                // no, en la moneda de la venta.
                $enSoles = $pago['monto_pen'] !== null;

                MovimientoCaja::create([
                    'apertura_caja_id' => $apertura->id,
                    'tipo' => 'ingreso',
                    'motivo_movimiento_id' => $motivoVentaId,
                    'descripcion' => "Venta {$nota->serie}-{$nota->numero}",
                    'cuenta_bancaria_id' => ($pago['forma_pago'] ?? null) === 'transferencia' ? ($pago['cuenta_bancaria_id'] ?? null) : null,
                    'billetera_id' => ($pago['forma_pago'] ?? null) === 'billetera' ? ($pago['billetera_id'] ?? null) : null,
                    'monto' => $enSoles ? $pago['monto_pen'] : $pago['monto'],
                    'moneda' => $enSoles ? 'PEN' : $nota->moneda,
                    'fecha' => $pago['fecha'],
                    'numero_operacion' => $pago['referencia'] ?? null,
                    'documento_referencia_tipo' => 'nota_venta',
                    'documento_referencia_id' => $nota->id,
                ]);
            }
        }

        // A crédito, cada cuota es una cuenta por cobrar con su vencimiento.
        if ($data['tipo_pago'] === 'credito' && ($data['cliente_id'] ?? null)) {
            $cuotas = $this->cuotas($data);

            foreach ($cuotas as $i => $cuota) {
                CuentaPorCobrar::create([
                    'nota_venta_id' => $nota->id,
                    'cliente_id' => $data['cliente_id'],
                    'numero_cuota' => $i + 1,
                    'total_cuotas' => count($cuotas),
                    'monto_total' => $cuota['monto'],
                    'moneda' => $nota->moneda,
                    'monto_pagado' => 0,
                    'saldo' => $cuota['monto'],
                    'fecha_vencimiento' => $cuota['fecha_vencimiento'],
                    'estado' => 'pendiente',
                ]);
            }
        }
    }

    /**
     * Una venta en dólares lleva su tipo de cambio: el que se indicó o el
     * SUNAT venta de su fecha. Sin ninguno no se puede llevar a soles.
     */
    private function conTipoCambio(array $data): array
    {
        if (($data['moneda'] ?? 'PEN') !== 'USD') {
            return ['tipo_cambio' => null] + $data;
        }

        $tipoCambio = (float) ($data['tipo_cambio'] ?? 0) ?: $this->tiposCambio->venta($data['fecha_emision']);
        if (! $tipoCambio) {
            throw new \DomainException(
                'No hay tipo de cambio para vender en dólares: ponlo en Tesorería → Tipo de cambio.'
            );
        }

        return ['tipo_cambio' => $tipoCambio] + $data;
    }

    /** A crédito: se necesita el cliente y que la venta quepa en su línea. */
    private function verificarCredito(array $data): void
    {
        if (($data['tipo_pago'] ?? 'contado') !== 'credito') {
            return;
        }

        $cliente = ($data['cliente_id'] ?? null) ? Cliente::with('lineaCredito')->find($data['cliente_id']) : null;
        if (! $cliente) {
            throw new \DomainException('Una venta al crédito necesita un cliente identificado.');
        }

        $this->credito->verificarVenta(
            $cliente,
            (float) $data['total'],
            $data['moneda'] ?? 'PEN',
            $data['tipo_cambio'] ?? null,
            (bool) ($data['autorizar_exceso'] ?? false),
        );
    }

    /**
     * Un cobro tal como se guarda: `monto` es lo que abona a la venta, en su
     * moneda. Si una venta en dólares se cobró con soles, el monto llega en
     * soles y se abona su equivalente al tipo de cambio que se indicó.
     */
    private function cobroDe(array $pago, string $moneda): array
    {
        $cobro = ['moneda' => $moneda, 'monto_pen' => null, 'tipo_cambio' => null]
            + Arr::except($pago, ['moneda', 'tipo_cambio', 'monto_pen']);

        $enSoles = $moneda !== 'PEN'
            && ($pago['moneda'] ?? $moneda) === 'PEN'
            && ($pago['forma_pago'] ?? null) !== 'credito';

        if (! $enSoles) {
            return $cobro;
        }

        $tipoCambio = (float) ($pago['tipo_cambio'] ?? 0);
        if ($tipoCambio <= 0) {
            throw new \DomainException('Para cobrar en soles una venta en dólares, pon el tipo de cambio.');
        }

        $soles = round((float) $pago['monto'], 2);

        return ['monto' => round($soles / $tipoCambio, 2), 'monto_pen' => $soles, 'tipo_cambio' => $tipoCambio] + $cobro;
    }

    /**
     * Las cuotas de una venta a crédito, por vencimiento. Sin cuotas, una sola
     * a los días de crédito del cliente. Deben sumar el total de la venta: la
     * última se queda con los céntimos del redondeo.
     *
     * @return list<array{fecha_vencimiento: string, monto: float}>
     */
    private function cuotas(array $data): array
    {
        $total = round((float) $data['total'], 2);
        $emision = Carbon::parse($data['fecha_emision'])->toDateString();

        $cuotas = collect($data['cuotas'] ?? [])
            ->map(fn ($c) => [
                'fecha_vencimiento' => Carbon::parse($c['fecha_vencimiento'])->toDateString(),
                'monto' => round((float) $c['monto'], 2),
            ])
            ->sortBy('fecha_vencimiento')
            ->values();

        if ($cuotas->isEmpty()) {
            $dias = (int) (LineaCredito::where('cliente_id', $data['cliente_id'])->value('dias_credito') ?? 0);

            return [['fecha_vencimiento' => Carbon::parse($emision)->addDays($dias)->toDateString(), 'monto' => $total]];
        }

        if ($cuotas->contains(fn ($c) => $c['fecha_vencimiento'] < $emision)) {
            throw new \DomainException('Una cuota no puede vencer antes de la fecha de la venta.');
        }

        $suma = round($cuotas->sum('monto'), 2);
        if (abs($suma - $total) > 0.01 * $cuotas->count()) {
            throw new \DomainException(
                'Las cuotas suman '.number_format($suma, 2).' y la venta es de '.number_format($total, 2).'.'
            );
        }

        $lista = $cuotas->all();
        $ultima = count($lista) - 1;
        $lista[$ultima]['monto'] = round($lista[$ultima]['monto'] + ($total - $suma), 2);

        return $lista;
    }

    /** Deshace el efecto de la venta: devuelve stock, borra caja y deuda. */
    private function revertir(NotaVenta $nota, string $origen = 'edicion_nota_venta'): void
    {
        $nota->load(['detalles.presentacion.producto', 'detalles.rollo', 'almacen']);

        $deMostrador = ! $nota->orden_venta_id;

        if (! $deMostrador) {
            $this->revertirDespachoDelPedido($nota, $origen);
        }

        foreach ($nota->detalles as $detalle) {
            if (! $deMostrador) {
                continue;
            }

            $rollo = $detalle->rollo;

            // La tela vuelve al rollo del que se cortó, con su mismo código.
            if ($rollo) {
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
     * La venta de un pedido descontó al despachar: al anularla, la tela
     * vuelve a los rollos que se cortaron y el stock al almacén del pedido.
     */
    private function revertirDespachoDelPedido(NotaVenta $nota, string $origen): void
    {
        $pedido = OrdenVenta::with(['detalles.rollos.rollo', 'detalles.presentacion', 'almacen'])
            ->find($nota->orden_venta_id);

        if (! $pedido || ! $pedido->almacen) {
            return;
        }

        foreach ($pedido->detalles as $linea) {
            foreach ($linea->rollos as $asignado) {
                if ($asignado->rollo) {
                    $this->rollos->devolver(
                        $asignado->rollo,
                        (float) $asignado->metros,
                        RolloMovimiento::CANCELACION,
                        'nota_venta',
                        $nota->id,
                        auth()->id(),
                    );
                }
            }

            $this->stockService->entrada(
                $linea->presentacion,
                $pedido->almacen,
                $linea->cantidadDespachada(),
                0,
                $origen,
                'nota_venta',
                $nota->id,
                auth()->id(),
                now()->toDateTimeString(),
                colorId: $linea->producto_color_id,
            );
        }
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
