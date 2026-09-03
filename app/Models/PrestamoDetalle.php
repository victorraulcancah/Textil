<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PrestamoDetalle extends Model
{
    protected $table = 'prestamo_detalles';

    protected $fillable = [
        'prestamo_id',
        'producto_presentacion_id',
        'cantidad_prestada',
    ];

    protected function casts(): array
    {
        return [
            'cantidad_prestada' => 'decimal:2',
        ];
    }

    public function prestamo()
    {
        return $this->belongsTo(Prestamo::class);
    }

    public function presentacion()
    {
        return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id');
    }
}
