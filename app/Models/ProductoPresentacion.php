<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductoPresentacion extends Model
{
    protected $table = 'producto_presentaciones';

    protected $fillable = [
        'producto_id',
        'nombre',
        'codigo_barras',
        'precio_venta',
        'precio_compra',
        'margen',
        'factor_conversion',
        'unidad_base_id',
        'producto_complementario_id',
        'cantidad_complementaria',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'precio_venta' => 'decimal:2',
            'precio_compra' => 'decimal:2',
            'margen' => 'decimal:2',
            'factor_conversion' => 'decimal:3',
            'cantidad_complementaria' => 'decimal:2',
            'activo' => 'boolean',
        ];
    }

    public function producto() { return $this->belongsTo(Producto::class); }
    public function unidadBase() { return $this->belongsTo(UnidadMedida::class, 'unidad_base_id'); }
    public function complementario() { return $this->belongsTo(Producto::class, 'producto_complementario_id'); }
}
