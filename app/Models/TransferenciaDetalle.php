<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TransferenciaDetalle extends Model
{
    protected $table = 'transferencia_detalles';

    protected $fillable = [
        'transferencia_id',
        'producto_presentacion_id',
        // El color que viaja; opcional porque hay productos que no se
        // manejan por color (mercería, insumos).
        'producto_color_id',
        'cantidad_enviada',
        'cantidad_recibida',
    ];

    protected function casts(): array
    {
        return [
            'cantidad_enviada' => 'decimal:2',
            'cantidad_recibida' => 'decimal:2',
        ];
    }

    public function transferencia() { return $this->belongsTo(Transferencia::class); }
    public function presentacion() { return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id'); }
    public function color() { return $this->belongsTo(ProductoColor::class, 'producto_color_id'); }
}
