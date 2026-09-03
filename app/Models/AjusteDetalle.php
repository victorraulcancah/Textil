<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AjusteDetalle extends Model
{
    protected $table = 'ajuste_detalles';

    protected $fillable = [
        'ajuste_id',
        'producto_presentacion_id',
        'cantidad',
        'costo_unitario',
        'subtotal',
        'cantidad_sistema',
        'cantidad_fisica',
        'diferencia',
    ];

    protected function casts(): array
    {
        return [
            'costo_unitario' => 'decimal:4',
            'subtotal' => 'decimal:2',
            'cantidad_sistema' => 'decimal:2',
            'cantidad_fisica' => 'decimal:2',
            'diferencia' => 'decimal:2',
        ];
    }

    public function ajuste() { return $this->belongsTo(AjusteInventario::class, 'ajuste_id'); }
    public function presentacion() { return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id'); }
}
