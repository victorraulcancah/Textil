<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductoAlmacenStock extends Model
{
    protected $table = 'producto_almacen_stock';

    protected $fillable = [
        'producto_id',
        'almacen_id',
        'stock_anterior',
        'stock_actual',
        'stock_reservado',
        'stock_disponible',
        'costo_promedio',
        'stock_minimo',
        'stock_maximo',
        'ubicacion',
    ];

    protected function casts(): array
    {
        return [
            'stock_anterior' => 'decimal:2',
            'stock_actual' => 'decimal:2',
            'stock_reservado' => 'decimal:2',
            'stock_disponible' => 'decimal:2',
            'stock_minimo' => 'decimal:2',
            'stock_maximo' => 'decimal:2',
        ];
    }

    public function producto() { return $this->belongsTo(Producto::class); }
    public function almacen() { return $this->belongsTo(Almacen::class); }
}
