<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrdenCompraDetalle extends Model
{
    protected $table = 'orden_compra_detalles';

    protected $fillable = [
        'orden_compra_id',
        'producto_presentacion_id',
        // Color pedido, cuando la tela se maneja por color (opcional: hay
        // insumos que no llevan color).
        'producto_color_id',
        'cantidad',
        // Rollos pedidos de ese color; informativo, no mueve stock. La
        // recepción sigue creando los rollos reales con sus propios metrajes.
        'rollos',
        'precio_unitario',
        'descuento',
        'subtotal',
    ];

    protected function casts(): array
    {
        return [
            'cantidad' => 'decimal:2',
            'precio_unitario' => 'decimal:2',
            'descuento' => 'decimal:2',
            'subtotal' => 'decimal:2',
            'rollos' => 'integer',
        ];
    }

    public function ordenCompra() { return $this->belongsTo(OrdenCompra::class); }
    public function presentacion() { return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id'); }
    public function color() { return $this->belongsTo(ProductoColor::class, 'producto_color_id'); }
}
