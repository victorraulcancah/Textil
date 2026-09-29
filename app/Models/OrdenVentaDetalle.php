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
 *
 * Pedida en rollos enteros (modo "rollos"), la línea va en el formato Metro:
 * `metros` es la estimación al metraje promedio y `cantidad` pasa a los
 * metros reales a medida que se escanean los rollos.
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
        // "rollos": N rollos enteros, cada uno con su metraje real;
        // "metros": X metros, cortando de un rollo si hace falta.
        'modo',
        // Cuántos rollos enteros se pidieron (solo en modo "rollos").
        'rollos_pedidos',
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
            'rollos_pedidos' => 'integer',
        ];
    }

    public const MODO_ROLLOS = 'rollos';
    public const MODO_METROS = 'metros';

    /** Se pidieron rollos enteros (no metros). */
    public function esPorRollos(): bool
    {
        return $this->modo === self::MODO_ROLLOS;
    }

    /** Cuántos rollos ya asignó el almacén a esta línea. */
    public function rollosAsignados(): int
    {
        $lista = $this->relationLoaded('rollos') ? $this->rollos : $this->rollos()->get();

        return $lista->count();
    }

    /** En una línea por rollos: cuántos faltan. Nunca negativo. */
    public function rollosPendientes(): int
    {
        return max(0, (int) $this->rollos_pedidos - $this->rollosAsignados());
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

    /**
     * Los metros de la línea. Por rollos: los reales de lo ya asignado más la
     * estimación de lo que falta. Por metros: lo pedido.
     */
    public function metrosTotales(): float
    {
        if ($this->esPorRollos()) {
            return round($this->metrosAsignados() + $this->metrosPendientes(), 2);
        }

        return (float) $this->metros;
    }

    /**
     * Lo que sale del stock al despachar, en unidades del formato de la
     * línea: con rollos asignados, sus metros reales; sin rollos, lo pedido.
     */
    public function cantidadDespachada(): float
    {
        $lista = $this->relationLoaded('rollos') ? $this->rollos : $this->rollos()->get();

        return $lista->isNotEmpty()
            ? $this->presentacion->desdeMetros((float) $lista->sum('metros'))
            : (float) $this->cantidad;
    }

    /** Metros ya cubiertos con rollos escaneados. */
    public function metrosAsignados(): float
    {
        $lista = $this->relationLoaded('rollos') ? $this->rollos : $this->rollos()->get();

        return round((float) $lista->sum('metros'), 2);
    }

    /**
     * Lo que falta por cubrir, en metros. Nunca negativo. En una línea por
     * rollos es una estimación: los rollos que faltan, al metraje promedio.
     */
    public function metrosPendientes(): float
    {
        if ($this->esPorRollos()) {
            $promedio = (int) $this->rollos_pedidos > 0 ? (float) $this->metros / (int) $this->rollos_pedidos : 0;

            return round($this->rollosPendientes() * $promedio, 2);
        }

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
        // Por rollos: cubierta con la cantidad de rollos pedida, midan lo que midan.
        if ($this->esPorRollos()) {
            return $this->rollosPendientes() === 0;
        }

        return $this->metrosAsignados() + 0.01 >= (float) $this->metros;
    }
}
