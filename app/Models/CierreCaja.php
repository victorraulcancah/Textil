<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CierreCaja extends Model
{
    protected $table = 'cierres_caja';

    protected $fillable = [
        'apertura_caja_id',
        'monto_sistema',
        'monto_contado',
        'diferencia',
        'fecha_cierre',
    ];

    protected function casts(): array
    {
        return [
            'monto_sistema' => 'decimal:2',
            'monto_contado' => 'decimal:2',
            'diferencia' => 'decimal:2',
            'fecha_cierre' => 'datetime',
        ];
    }

    public function apertura()
    {
        return $this->belongsTo(AperturaCaja::class, 'apertura_caja_id');
    }
}
