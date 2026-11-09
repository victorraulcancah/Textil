<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * El saldo de tela suelta (por metros) de una tela y color en un almacén: lo que se vende por corte sin escanear un
 * rollo. `metros` es lo que hay; `reservado`, lo que los pedidos ya solicitados tienen apartado de eso.
 */
class StockMetros extends Model
{
    protected $table = 'stock_metros';

    protected $fillable = ['producto_id', 'producto_color_id', 'almacen_id', 'metros', 'reservado'];

    protected function casts(): array
    {
        return [
            'metros' => 'decimal:2',
            'reservado' => 'decimal:2',
        ];
    }

    /** Lo que se puede prometer a otro pedido. */
    public function disponible(): float
    {
        return round((float) $this->metros - (float) $this->reservado, 2);
    }

    public function producto()
    {
        return $this->belongsTo(Producto::class);
    }

    public function color()
    {
        return $this->belongsTo(ProductoColor::class, 'producto_color_id');
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }
}
