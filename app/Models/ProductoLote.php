<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductoLote extends Model
{
    protected $table = 'producto_lotes';

    protected $fillable = [
        'producto_id',
        'numero_lote',
        'fecha_vencimiento',
        'stock_inicial',
    ];

    protected function casts(): array
    {
        return [
            'fecha_vencimiento' => 'date',
            'stock_inicial' => 'decimal:2',
        ];
    }

    public function producto() { return $this->belongsTo(Producto::class); }
}
