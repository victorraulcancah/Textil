<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotaVentaDetalle extends Model
{
    protected $table = 'nota_venta_detalles';

    protected $fillable = [
        'nota_venta_id',
        'producto_presentacion_id',
        'rollo_id',
        // Cuánto medía el rollo al venderlo (el "factor") y si salió entero o fue un corte.
        'metros_rollo',
        'rollo_entero',
        'cantidad',
        'precio_unitario',
        'descuento',
        'subtotal',
    ];

    protected function casts(): array
    {
        return [
            'cantidad' => 'decimal:2',
            'metros_rollo' => 'decimal:2',
            'rollo_entero' => 'boolean',
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

    /** Rollo del que salió esta línea, si el producto se maneja por rollos. */
    public function rollo()
    {
        return $this->belongsTo(Rollo::class);
    }
}
