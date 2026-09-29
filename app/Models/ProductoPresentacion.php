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

    /**
     * Cuántos metros son `$cantidad` de este formato. El stock va en unidad
     * base (centímetros en la tela); los rollos, en metros.
     */
    public function aMetros(float $cantidad): float
    {
        $basePorMetro = max((float) ($this->producto?->factorBasePorMetro() ?? 1), 0.0001);
        $factor = (float) ($this->factor_conversion ?: 1);

        return round($cantidad * $factor / $basePorMetro, 2);
    }

    /**
     * Lo contrario: cuántas unidades de este formato son esos metros. En el
     * formato "Metro" es lo mismo; en uno de "Rollo 50 m", 100 m son 2.
     */
    public function desdeMetros(float $metros): float
    {
        $basePorMetro = max((float) ($this->producto?->factorBasePorMetro() ?? 1), 0.0001);
        $factor = max((float) ($this->factor_conversion ?: 1), 0.0001);

        return round($metros * $basePorMetro / $factor, 4);
    }

    public function unidadBase() { return $this->belongsTo(UnidadMedida::class, 'unidad_base_id'); }
    public function complementario() { return $this->belongsTo(Producto::class, 'producto_complementario_id'); }

    /**
     * Los precios de la lista: por tipo de precio y desde una cantidad. El
     * principal "desde 1" no está aquí: es `precio_venta`.
     */
    public function precios() { return $this->hasMany(ProductoPrecio::class); }
}
