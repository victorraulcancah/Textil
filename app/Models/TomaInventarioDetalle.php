<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TomaInventarioDetalle extends Model
{
    protected $table = 'toma_inventario_detalles';

    protected $fillable = [
        'toma_id',
        'producto_presentacion_id',
        'stock_sistema',
        'stock_contado',
        'diferencia',
    ];

    protected function casts(): array
    {
        return [
            'stock_sistema' => 'decimal:2',
            'stock_contado' => 'decimal:2',
            'diferencia' => 'decimal:2',
        ];
    }

    public function toma() { return $this->belongsTo(TomaInventario::class); }
    public function presentacion() { return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id'); }
}
