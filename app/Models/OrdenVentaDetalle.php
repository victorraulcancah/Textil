<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Una línea de lo que pidió el cliente: producto, cantidad y precio.
 *
 * No dice qué rollos son —el vendedor no puede saberlo—. Los rollos que la
 * cubren los va asignando el almacenero al escanearlos, y viven en
 * `orden_venta_rollos`.
 *
 *   cantidad → en unidades de la presentación (3 "Rollo 50 m", 150 "Metro")
 *   metros   → esa misma cantidad llevada a metros, que es como se mide la tela
 *              y como se comparan los rollos asignados
 */
class OrdenVentaDetalle extends Model
{
    protected $table = 'orden_venta_detalles';

    protected $fillable = [
        'orden_venta_id',
        'producto_presentacion_id',
        'cantidad',
        'descripcion',
        'metros',
        'precio_unitario',
        'descuento',
        'subtotal',
    ];

    protected function casts(): array
    {
        return [
            'cantidad' => 'decimal:2',
            'metros' => 'decimal:2',
            'precio_unitario' => 'decimal:2',
            'descuento' => 'decimal:2',
            'subtotal' => 'decimal:2',
        ];
    }

    public function ordenVenta()
    {
        return $this->belongsTo(OrdenVenta::class);
    }

    public function presentacion()
    {
        return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id');
    }

    /** Los rollos que el almacén asignó a esta línea. */
    public function rollos()
    {
        return $this->hasMany(OrdenVentaRollo::class, 'orden_venta_detalle_id');
    }

    /** Metros ya cubiertos con rollos escaneados. */
    public function metrosAsignados(): float
    {
        $lista = $this->relationLoaded('rollos') ? $this->rollos : $this->rollos()->get();

        return round((float) $lista->sum('metros'), 2);
    }

    /** Lo que falta por cubrir. Nunca negativo. */
    public function metrosPendientes(): float
    {
        return max(0, round((float) $this->metros - $this->metrosAsignados(), 2));
    }

    /**
     * ¿La línea está cubierta?
     *
     * Se admite un centímetro de holgura: los rollos vienen con metrajes
     * cerrados y exigir el milímetro exacto dejaría pedidos eternamente
     * incompletos.
     */
    public function estaCubierta(): bool
    {
        return $this->metrosAsignados() + 0.01 >= (float) $this->metros;
    }
}
