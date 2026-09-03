<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotaVentaDetalle extends Model
{
    protected $table = 'nota_venta_detalles';

    protected $fillable = [
        'nota_venta_id',
        'producto_presentacion_id',
        'cantidad',
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
        ];
    }

    public function notaVenta()
    {
        return $this->belongsTo(NotaVenta::class);
    }

    public function presentacion()
    {
        return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id');
    }
}
