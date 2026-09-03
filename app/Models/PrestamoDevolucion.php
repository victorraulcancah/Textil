<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PrestamoDevolucion extends Model
{
    protected $table = 'prestamo_devoluciones';

    protected $fillable = [
        'prestamo_id',
        'producto_presentacion_id',
        'cantidad',
        'fecha',
        'usuario_id',
    ];

    protected function casts(): array
    {
        return [
            'cantidad' => 'decimal:2',
            'fecha' => 'datetime',
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

    public function usuario()
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }
}
