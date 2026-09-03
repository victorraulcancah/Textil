<?php
namespace App\Services;

use App\Models\Almacen;
use App\Models\MovimientoInventario;
use App\Models\ProductoAlmacenStock;
use App\Models\ProductoPresentacion;
use Illuminate\Support\Facades\DB;

class StockService
{
    /**
     * Registra una entrada de stock.
     * $cantidad = cantidad en unidades de la PRESENTACIÓN (ej: 10 cajas).
     * El sistema convierte automáticamente a unidad base usando factor_conversion.
     */
    public function entrada(
        ProductoPresentacion $presentacion,
        Almacen $almacen,
        float $cantidadPresentacion,
        float $costoUnitario,
        string $origen,
        ?string $documentoTipo = null,
        ?int $documentoId = null,
        ?int $usuarioId = null,
        ?string $fecha = null
    ): MovimientoInventario {
        return DB::transaction(function () use ($presentacion, $almacen, $cantidadPresentacion, $costoUnitario, $origen, $documentoTipo, $documentoId, $usuarioId, $fecha) {
            $factor = (float) $presentacion->factor_conversion ?: 1;
            $cantidadBase = $cantidadPresentacion * $factor;

            $stock = $this->getOrCreateStock($presentacion, $almacen);
            $anterior = (float) $stock->stock_actual;
            $costoAnterior = (float) $stock->costo_promedio;

            // Si no se informa costo (ajustes/traslados/préstamos), se valora al costo promedio
            // actual para no distorsionar el promedio. Solo las compras traen costo real.
            $costoEntrada = $costoUnitario > 0 ? $costoUnitario : $costoAnterior;

            $nuevoStock = $anterior + $cantidadBase;
            $costoActual = $nuevoStock > 0
                ? (($anterior * $costoAnterior) + ($cantidadBase * $costoEntrada)) / $nuevoStock
                : $costoEntrada;

            $stock->stock_anterior = $anterior;
            $stock->stock_actual = $nuevoStock;
            $stock->stock_disponible = $nuevoStock - (float) $stock->stock_reservado;
            $stock->costo_promedio = $costoActual;
            $stock->save();

            return $this->registrarMovimiento(
                $presentacion, $almacen, 'entrada', $origen,
                $cantidadPresentacion, $cantidadBase, $costoEntrada, $costoAnterior, $costoActual,
                $anterior, $nuevoStock, $documentoTipo, $documentoId, $usuarioId, $fecha
            );
        });
    }

    /**
     * Registra una salida de stock.
     * $cantidad = cantidad en unidades de la PRESENTACIÓN (ej: 2 botellas).
     */
    public function salida(
        ProductoPresentacion $presentacion,
        Almacen $almacen,
        float $cantidadPresentacion,
        float $costoUnitario,
        string $origen,
        ?string $documentoTipo = null,
        ?int $documentoId = null,
        ?int $usuarioId = null,
        ?string $fecha = null
    ): MovimientoInventario {
        return DB::transaction(function () use ($presentacion, $almacen, $cantidadPresentacion, $costoUnitario, $origen, $documentoTipo, $documentoId, $usuarioId, $fecha) {
            $factor = (float) $presentacion->factor_conversion ?: 1;
            $cantidadBase = $cantidadPresentacion * $factor;

            $stock = $this->getOrCreateStock($presentacion, $almacen);
            $anterior = (float) $stock->stock_actual;

            if ($cantidadBase > $anterior) {
                // El disponible se guarda en unidad base; el usuario pide en unidades
                // de la presentación. Se informan las dos para que no se confundan.
                $abrev = $presentacion->producto?->unidadMedida?->abreviatura ?? 'u. base';
                $disponiblePresentacion = $factor > 0 ? round($anterior / $factor, 2) : $anterior;

                throw new \RuntimeException(
                    "Stock insuficiente para \"{$presentacion->nombre}\" en \"{$almacen->nombre}\". "
                    . "Disponible: {$disponiblePresentacion} x {$presentacion->nombre} "
                    . "({$anterior} {$abrev}). Pediste {$cantidadPresentacion}."
                );
            }

            // En una salida el costo promedio no cambia; se valora al promedio vigente.
            $costoPromedio = (float) $stock->costo_promedio;

            $stock->stock_anterior = $anterior;
            $stock->stock_actual = $anterior - $cantidadBase;
            $stock->stock_disponible = $stock->stock_actual - $stock->stock_reservado;
            $stock->save();

            return $this->registrarMovimiento(
                $presentacion, $almacen, 'salida', $origen,
                -$cantidadPresentacion, -$cantidadBase, $costoPromedio, $costoPromedio, $costoPromedio,
                $anterior, $stock->stock_actual, $documentoTipo, $documentoId, $usuarioId, $fecha
            );
        });
    }

    public function transferir(
        ProductoPresentacion $presentacion,
        Almacen $almacenOrigen,
        Almacen $almacenDestino,
        float $cantidadPresentacion,
        float $costoUnitario,
        ?int $usuarioId = null
    ): array {
        return DB::transaction(function () use ($presentacion, $almacenOrigen, $almacenDestino, $cantidadPresentacion, $costoUnitario, $usuarioId) {
            $salida = $this->salida(
                $presentacion, $almacenOrigen, $cantidadPresentacion, $costoUnitario,
                'transferencia', 'transferencia', null, $usuarioId
            );
            $entrada = $this->entrada(
                $presentacion, $almacenDestino, $cantidadPresentacion, $costoUnitario,
                'transferencia', 'transferencia', null, $usuarioId
            );
            return [$salida, $entrada];
        });
    }

    public function reservar(ProductoPresentacion $presentacion, Almacen $almacen, float $cantidadPresentacion): void
    {
        DB::transaction(function () use ($presentacion, $almacen, $cantidadPresentacion) {
            $factor = (float) $presentacion->factor_conversion ?: 1;
            $cantidadBase = $cantidadPresentacion * $factor;

            $stock = $this->getOrCreateStock($presentacion, $almacen);
            $stock->stock_reservado += $cantidadBase;
            $stock->stock_disponible = $stock->stock_actual - $stock->stock_reservado;
            $stock->save();
        });
    }

    public function liberarReserva(ProductoPresentacion $presentacion, Almacen $almacen, float $cantidadPresentacion): void
    {
        DB::transaction(function () use ($presentacion, $almacen, $cantidadPresentacion) {
            $factor = (float) $presentacion->factor_conversion ?: 1;
            $cantidadBase = $cantidadPresentacion * $factor;

            $stock = $this->getOrCreateStock($presentacion, $almacen);
            $stock->stock_reservado -= $cantidadBase;
            $stock->stock_disponible = $stock->stock_actual - $stock->stock_reservado;
            $stock->save();
        });
    }

    /**
     * Debe llamarse dentro de una transacción activa: bloquea la fila
     * (o la crea si no existe) para evitar carreras entre movimientos concurrentes.
     */
    private function getOrCreateStock(ProductoPresentacion $presentacion, Almacen $almacen): ProductoAlmacenStock
    {
        $stock = ProductoAlmacenStock::where('producto_id', $presentacion->producto_id)
            ->where('almacen_id', $almacen->id)
            ->lockForUpdate()
            ->first();

        return $stock ?? ProductoAlmacenStock::create([
            'producto_id' => $presentacion->producto_id,
            'almacen_id' => $almacen->id,
            'stock_actual' => 0,
            'stock_reservado' => 0,
            'stock_disponible' => 0,
            'costo_promedio' => 0,
            'stock_minimo' => 0,
            'stock_maximo' => 0,
        ]);
    }

    private function registrarMovimiento(
        ProductoPresentacion $presentacion,
        Almacen $almacen,
        string $tipoMovimiento,
        string $origen,
        float $cantidadPresentacion,
        float $cantidadBase,
        float $costoUnitario,
        float $costoAnterior,
        float $costoActual,
        float $stockAnterior,
        float $saldoStock,
        ?string $documentoTipo = null,
        ?int $documentoId = null,
        ?int $usuarioId = null,
        ?string $fecha = null
    ): MovimientoInventario {
        return MovimientoInventario::create([
            'producto_id' => $presentacion->producto_id,
            'almacen_id' => $almacen->id,
            'tipo_movimiento' => $tipoMovimiento,
            'origen' => $origen,
            'documento_referencia_tipo' => $documentoTipo,
            'documento_referencia_id' => $documentoId,
            'cantidad' => $cantidadBase,
            'stock_anterior' => $stockAnterior,
            'costo_unitario' => $costoUnitario,
            'costo_anterior' => $costoAnterior,
            'costo_actual' => $costoActual,
            'saldo_stock' => $saldoStock,
            // Si llega solo la fecha (ej. "2026-08-09"), se le agrega la hora actual:
            // con 00:00 el kardex desordenaba los movimientos del mismo día.
            'fecha' => $this->fechaConHora($fecha),
            'usuario_id' => $usuarioId,
        ]);
    }

    /**
     * Respeta la fecha que elige el usuario, pero conserva la hora del registro.
     * Sin hora, todos los movimientos de un día quedan empatados en 00:00 y el
     * kardex no puede ordenarlos en la secuencia real en que ocurrieron.
     */
    private function fechaConHora(?string $fecha): \Illuminate\Support\Carbon
    {
        if (! $fecha) {
            return now();
        }

        $parsed = \Illuminate\Support\Carbon::parse($fecha);

        return $parsed->isStartOfDay()
            ? $parsed->setTimeFrom(now())
            : $parsed;
    }
}
