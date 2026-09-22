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
        // Color pedido; opcional (hay insumos que no se piden por color). El
        // almacén solo puede cubrir la línea con rollos de este color.
        'producto_color_id',
        'cantidad',
        'descripcion',
        'metros',
        // Dónde y cuánto se apartó al solicitar el pedido (en unidades de la
        // presentación, igual que `cantidad`). Se limpia al liberar.
        'reserva_almacen_id',
        'cantidad_reservada',
        'precio_unitario',
        'descuento',
        'subtotal',
        // El precio es una estimación mientras no se sepa el metraje real de
        // un rollo: marcada, la línea no entra al subtotal ni se muestra.
        'precio_oculto',
    ];

    protected function casts(): array
    {
        return [
            'cantidad' => 'decimal:2',
            'metros' => 'decimal:2',
            'cantidad_reservada' => 'decimal:2',
            'precio_unitario' => 'decimal:2',
            'descuento' => 'decimal:2',
            'subtotal' => 'decimal:2',
            'precio_oculto' => 'boolean',
        ];
    }

    public function ordenVenta()
    {
        return $this->belongsTo(OrdenVenta::class);
    }

    /** El almacén en el que quedó apartado el stock de esta línea. */
    public function almacenReserva()
    {
        return $this->belongsTo(Almacen::class, 'reserva_almacen_id');
    }

    public function presentacion()
    {
        return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id');
    }

    public function color()
    {
        return $this->belongsTo(ProductoColor::class, 'producto_color_id');
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
