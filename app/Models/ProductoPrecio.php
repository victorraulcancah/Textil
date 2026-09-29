<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * El precio de una presentación para un tipo de precio, desde una cantidad:
 * "Metro, Mayorista, desde 100 → S/ 9.00".
 */
class ProductoPrecio extends Model
{
    protected $table = 'producto_precios';

    protected $fillable = ['producto_presentacion_id', 'tipo_precio_id', 'desde', 'precio', 'margen'];

    protected function casts(): array
    {
        return [
            'desde' => 'decimal:2',
            'precio' => 'decimal:4',
            'margen' => 'decimal:2',
        ];
    }

    public function presentacion()
    {
        return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id');
    }

    public function tipoPrecio()
    {
        return $this->belongsTo(TipoPrecio::class);
    }
}
