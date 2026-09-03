<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MovimientoInventario extends Model
{
    protected $table = 'movimientos_inventario';

    protected $fillable = [
        'producto_id',
        'almacen_id',
        'tipo_movimiento',
        'origen',
        'documento_referencia_tipo',
        'documento_referencia_id',
        'cantidad',
        'stock_anterior',
        'costo_unitario',
        'costo_anterior',
        'costo_actual',
        'saldo_stock',
        'fecha',
        'usuario_id',
    ];

    protected function casts(): array
    {
        return [
            'cantidad' => 'decimal:2',
            'stock_anterior' => 'decimal:2',
            'costo_unitario' => 'decimal:2',
            'saldo_stock' => 'decimal:2',
            'fecha' => 'datetime',
        ];
    }

    public function producto() { return $this->belongsTo(Producto::class); }
    public function almacen() { return $this->belongsTo(Almacen::class); }
    public function usuario() { return $this->belongsTo(User::class); }
}
