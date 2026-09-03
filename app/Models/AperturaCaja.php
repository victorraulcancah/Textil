<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AperturaCaja extends Model
{
    protected $table = 'aperturas_caja';

    protected $fillable = [
        'caja_id',
        'usuario_id',
        'monto_inicial',
        'fecha_apertura',
        'estado',
    ];

    protected function casts(): array
    {
        return [
            'monto_inicial' => 'decimal:2',
            'fecha_apertura' => 'datetime',
        ];
    }

    public function caja()
    {
        return $this->belongsTo(Caja::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class);
    }

    public function movimientos()
    {
        return $this->hasMany(MovimientoCaja::class);
    }

    public function cierre()
    {
        return $this->hasOne(CierreCaja::class);
    }
}
