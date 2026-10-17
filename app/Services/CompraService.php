<?php

namespace App\Services;

use App\Models\Compra;
use App\Models\CuentaPorPagar;
use App\Models\OrdenCompra;
use App\Models\SerieDocumento;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * El ciclo de vida de una compra: registrarla, corregirla, cerrarla, anularla y eliminarla. Los gastos y el dinero
 * (pagos, caja, deuda) los llevan sus propios servicios.
 *
 * Las reglas que impiden una operación se lanzan como `\DomainException` con el mensaje para el usuario.
 */
class CompraService
{
    /** Estados de la orden de compra desde los que ya se puede transformar en compra. */
    private const ESTADOS_ORDEN_APROBADA = ['aprobada', 'enviada', 'parcial', 'completada'];

    public function __construct(
        private readonly CompraGastoService $gastos,
        private readonly CompraPagoService $pagos,
    ) {}

    /** Registra la compra con sus líneas, gastos y pagos, y deja al día la deuda y la caja. */
    public function registrar(array $data): Compra
    {
        $this->exigirOrdenAprobada($data['orden_compra_id'] ?? null);

        return DB::transaction(function () use ($data) {
            $subtotal = $this->calcularSubtotal($data['detalles']);
            $flete = (float) ($data['flete'] ?? 0);

            $compra = Compra::create([
                'correlativo' => $this->siguienteCorrelativo(),
                'proveedor_id' => $data['proveedor_id'] ?? null,
                'orden_compra_id' => $data['orden_compra_id'] ?? null,
                'tipo_documento' => $data['tipo_documento'],
                'serie' => $data['serie'] ?? null,
                'numero' => $data['numero'] ?? null,
                'guia' => $data['guia'] ?? null,
                'fecha' => $data['fecha'],
                'forma_pago' => $data['forma_pago'],
                'dias_credito' => $data['dias_credito'] ?? 0,
                'fecha_vencimiento' => $data['fecha_vencimiento'] ?? null,
                'flete' => $flete,

                // Datos del embarque: permiten saber de qué importación vino
                // cada rollo y con qué tipo de cambio se costeó.
                'es_importacion' => (bool) ($data['es_importacion'] ?? false),
                'numero_importacion' => $data['numero_importacion'] ?? null,
                'contenedor' => $data['contenedor'] ?? null,
                'precinto' => $data['precinto'] ?? null,
                'bl' => $data['bl'] ?? null,
                'pais_origen' => $data['pais_origen'] ?? null,
                'pais_destino' => $data['pais_destino'] ?? null,
                'puerto_embarque' => $data['puerto_embarque'] ?? null,
                'puerto_destino' => $data['puerto_destino'] ?? null,
                'cargo_type' => $data['cargo_type'] ?? null,
                'medio_transporte' => $data['medio_transporte'] ?? null,
                'incoterm' => $data['incoterm'] ?? null,
                'fecha_llegada' => $data['fecha_llegada'] ?? null,
                'fecha_embarque_estimada' => $data['fecha_embarque_estimada'] ?? null,
                'elaborado_por' => $data['elaborado_por'] ?? null,
                'aprobado_por' => $data['aprobado_por'] ?? null,
                'moneda_origen' => $data['moneda_origen'] ?? 'PEN',
                'tipo_cambio' => $data['tipo_cambio'] ?? null,

                'subtotal' => $subtotal,
                'total' => round($subtotal + $flete, 2),
                'estado' => 'registrada',
                'observaciones' => $data['observaciones'] ?? null,
                'usuario_id' => auth()->id(),
            ]);

            $this->crearDetalles($compra, $data['detalles']);
            $this->gastos->guardar($compra, $data['gastos'] ?? []);
            $this->pagos->guardar($compra, $data['pagos'] ?? []);
            $this->pagos->sincronizar($compra);

            return $compra;
        });
    }

    /**
     * Corrige la compra. Una compra anulada queda congelada: reabrirla dejaría el histórico sin correspondencia con lo
     * que se anuló.
     */
    public function actualizar(Compra $compra, array $data): Compra
    {
        if ($compra->estado === 'anulada') {
            throw new \DomainException('La compra está anulada y no se puede editar.');
        }

        DB::transaction(function () use ($data, $compra) {
            $compra->update(collect($data)->except(['detalles', 'pagos', 'gastos'])->all());

            if (array_key_exists('gastos', $data)) {
                $this->gastos->reemplazar($compra, $data['gastos'] ?? []);
            }

            // Detalles y pagos se reemplazan completos: más simple y sin huérfanos.
            if (array_key_exists('detalles', $data)) {
                $compra->detalles()->delete();
                $this->crearDetalles($compra, $data['detalles']);

                $subtotal = $this->calcularSubtotal($data['detalles']);
                $flete = (float) ($data['flete'] ?? $compra->flete);

                $compra->update([
                    'subtotal' => $subtotal,
                    'total' => round($subtotal + $flete, 2),
                ]);
            }

            if (array_key_exists('pagos', $data)) {
                $this->pagos->reemplazar($compra, $data['pagos'] ?? []);
            }

            $this->pagos->sincronizar($compra->fresh());
        });

        return $compra->fresh();
    }

    /**
     * Cierra lo que falta por recibir: se pidieron 100, llegaron 50 y el resto ya no va a llegar. El pendiente queda
     * registrado como cantidad finalizada.
     */
    public function finalizar(Compra $compra, string $motivo): Compra
    {
        if ($compra->estado === 'anulada') {
            throw new \DomainException('La compra está anulada.');
        }
        if ($compra->finalizado) {
            throw new \DomainException('La compra ya está finalizada.');
        }

        DB::transaction(function () use ($motivo, $compra) {
            $pendientes = $compra->pendientePorLinea();

            foreach ($compra->detalles as $detalle) {
                $pendiente = $pendientes[$detalle->id] ?? 0;
                if ($pendiente > 0) {
                    $detalle->increment('cantidad_finalizada', $pendiente);
                }
            }

            $compra->update([
                'finalizado' => true,
                'motivo_finalizacion' => $motivo,
                'fecha_finalizacion' => now(),
                'estado' => 'recepcionada',
            ]);
        });

        return $compra->fresh();
    }

    /** Anula la compra: la deuda con el proveedor desaparece y lo pagado al contado vuelve a la caja. */
    public function anular(Compra $compra): Compra
    {
        DB::transaction(function () use ($compra) {
            $compra->update(['estado' => 'anulada']);
            CuentaPorPagar::where('compra_id', $compra->id)->delete();
            $this->pagos->sincronizarSalidasDeCaja($compra->fresh());
        });

        return $compra->fresh();
    }

    /** Elimina la compra con su deuda, sus salidas de caja, sus líneas y sus pagos. */
    public function eliminar(Compra $compra): void
    {
        DB::transaction(function () use ($compra) {
            CuentaPorPagar::where('compra_id', $compra->id)->delete();
            $this->pagos->quitarSalidasDeCaja($compra);
            $compra->detalles()->delete();
            $compra->pagos()->delete();
            $compra->delete();
        });
    }

    /** Una orden de compra solo se transforma en compra cuando ya está aprobada. */
    private function exigirOrdenAprobada(?int $ordenId): void
    {
        if (! $ordenId) {
            return;
        }

        $orden = OrdenCompra::find($ordenId);
        if ($orden && ! in_array($orden->estado, self::ESTADOS_ORDEN_APROBADA, true)) {
            throw ValidationException::withMessages([
                'orden_compra_id' => 'La orden de compra debe estar aprobada para transformarla en compra.',
            ]);
        }
    }

    /** Suma de las líneas: cantidad × costo, redondeado por línea. */
    private function calcularSubtotal(array $detalles): float
    {
        return collect($detalles)->sum(
            fn ($d) => round((float) $d['cantidad'] * (float) $d['costo_unitario'], 2),
        );
    }

    /** Crea las líneas calculando el subtotal de cada una. */
    private function crearDetalles(Compra $compra, array $detalles): void
    {
        foreach ($detalles as $d) {
            $cantidad = (float) $d['cantidad'];
            $costo = (float) $d['costo_unitario'];

            $compra->detalles()->create([
                'producto_presentacion_id' => $d['producto_presentacion_id'],
                'producto_color_id' => $d['producto_color_id'] ?? null,
                'color_code' => $d['color_code'] ?? null,
                'rollos' => $d['rollos'] ?? null,
                'cantidad' => $cantidad,
                'costo_unitario' => $costo,
                'subtotal' => round($cantidad * $costo, 2),
            ]);
        }
    }

    /**
     * Correlativo interno propio de la compra (C001-001), automático desde 1. El usuario no lo ingresa. Se bloquea la
     * fila para que dos compras simultáneas no tomen el mismo número.
     */
    private function siguienteCorrelativo(): int
    {
        $serie = SerieDocumento::where('tipo_documento', 'compra')
            ->where('serie', Compra::SERIE_INTERNA)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'compra', 'serie' => Compra::SERIE_INTERNA],
                ['numero_actual' => 0, 'activo' => true],
            );

        // El contador puede ir por detrás de lo ya usado (datos de ejemplo, o
        // compras cargadas a mano): se saltan los correlativos ocupados para no
        // repetir el número interno de un documento.
        do {
            $serie->increment('numero_actual');
        } while (Compra::where('correlativo', $serie->numero_actual)->exists());

        return $serie->numero_actual;
    }
}
