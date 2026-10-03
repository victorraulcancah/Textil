<?php

namespace App\Services;

use App\Models\AjusteInventario;
use App\Models\ProductoAlmacenStock;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Models\SerieDocumento;

/**
 * Un ajuste de sistema sobre un rollo: se le descuentan metros (no se quita el rollo) y queda el
 * ajuste de inventario —con su motivo— y el movimiento del rollo. Es lo mismo que el almacén hace
 * en Ajustes, pero también con el rollo ya tomado por un pedido.
 */
class AjusteRolloService
{
    public function __construct(
        protected RolloService $rollos,
        protected StockService $stock,
    ) {}

    /**
     * Descuenta `$metros` del rollo. Va dentro de la transacción de quien lo llama.
     *
     * @throws \DomainException si el rollo no tiene tantos metros o no se maneja por metros
     */
    public function descontar(Rollo $rollo, float $metros, string $motivo, ?string $observaciones = null): AjusteInventario
    {
        $rollo->loadMissing('producto.presentaciones.unidadBase', 'almacen');
        $presentacion = $rollo->producto?->presentacionMetro();
        if (! $presentacion) {
            throw new \DomainException("\"{$rollo->producto?->nombre}\" no se maneja por metros.");
        }

        $metros = round($metros, 2);
        $almacen = $rollo->almacen;

        $ajuste = AjusteInventario::create([
            'serie' => $serie = AjusteInventario::serieDeAlmacen($almacen->id),
            'numero' => $this->siguienteNumero($serie, $almacen->id),
            'almacen_id' => $almacen->id,
            'tipo' => 'salida',
            'motivo' => $motivo,
            'observaciones' => $observaciones,
            'estado' => 'aprobado',
            'usuario_solicita_id' => auth()->id(),
            'usuario_aprueba_id' => auth()->id(),
            'fecha' => now(),
        ]);

        // Lanza si el rollo no tiene tantos metros.
        $this->rollos->cortar($rollo, $metros, RolloMovimiento::AJUSTE, 'ajuste_inventario', $ajuste->id, auth()->id());

        $costoUnidad = $this->costoDe($presentacion, $almacen->id);
        $cantidad = $presentacion->desdeMetros($metros);
        $subtotal = round($cantidad * $costoUnidad, 2);

        $ajuste->detalles()->create([
            'producto_presentacion_id' => $presentacion->id,
            'producto_color_id' => $rollo->producto_color_id,
            'rollo_id' => $rollo->id,
            'cantidad' => $cantidad,
            'costo_unitario' => $costoUnidad,
            'subtotal' => $subtotal,
        ]);

        // Con el color del rollo: así el kardex de ese color muestra también el descuento.
        $this->stock->salida($presentacion, $almacen, $cantidad, 0, 'ajuste_manual', 'ajuste_inventario', $ajuste->id, auth()->id(), null, $rollo->producto_color_id);

        $ajuste->update(['total' => $subtotal]);

        return $ajuste;
    }

    /** El costo (no el precio de venta) de una unidad de la presentación: el del catálogo o el promedio del almacén. */
    private function costoDe($presentacion, int $almacenId): float
    {
        $catalogo = (float) $presentacion->precio_compra;
        if ($catalogo > 0) {
            return round($catalogo, 4);
        }

        $factor = (float) $presentacion->factor_conversion ?: 1;
        $promedioBase = (float) ProductoAlmacenStock::where('producto_id', $presentacion->producto_id)
            ->where('almacen_id', $almacenId)
            ->value('costo_promedio');

        return round($promedioBase * $factor, 4);
    }

    private function siguienteNumero(string $serie, ?int $almacenId = null): string
    {
        $serieDoc = SerieDocumento::where('tipo_documento', 'ajuste_inventario')
            ->where('serie', $serie)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'ajuste_inventario', 'serie' => $serie],
                ['numero_actual' => 0, 'activo' => true, 'almacen_id' => $almacenId]
            );

        $serieDoc->increment('numero_actual');

        return str_pad($serieDoc->numero_actual, 4, '0', STR_PAD_LEFT);
    }
}
