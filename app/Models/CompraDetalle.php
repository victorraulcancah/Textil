<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CompraDetalle extends Model
{
    protected $table = 'compra_detalles';

    protected $fillable = [
        'compra_id',
        'producto_presentacion_id',
        'producto_color_id',
        'cantidad',
        'rollos',
        'cantidad_finalizada',
        'costo_unitario',
        'subtotal',
    ];

    protected function casts(): array
    {
        return [
            'cantidad' => 'decimal:2',
            'rollos' => 'integer',
            'cantidad_finalizada' => 'decimal:2',
            'costo_unitario' => 'decimal:2',
            'subtotal' => 'decimal:2',
        ];
    }

    public function compra()
    {
        return $this->belongsTo(Compra::class);
    }

    public function presentacion()
    {
        return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id');
    }

    /** En qué color viene esta línea, igual que en la orden de compra. */
    public function color()
    {
        return $this->belongsTo(ProductoColor::class, 'producto_color_id');
    }
}
