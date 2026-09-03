<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TransferenciaDetalle extends Model
{
    protected $table = 'transferencia_detalles';

    protected $fillable = [
        'transferencia_id',
        'producto_presentacion_id',
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
}
