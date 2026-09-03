<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SolicitudCompraDetalle extends Model
{
    protected $table = 'solicitud_compra_detalles';

    protected $fillable = [
        'solicitud_id',
        'producto_presentacion_id',
        'cantidad_solicitada',
        'cantidad_aprobada',
        'observaciones',
    ];

    protected function casts(): array
    {
        return [
            'cantidad_solicitada' => 'decimal:2',
            'cantidad_aprobada' => 'decimal:2',
        ];
    }

    public function solicitud() { return $this->belongsTo(SolicitudCompra::class, 'solicitud_id'); }
    public function presentacion() { return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id'); }
}
