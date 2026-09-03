<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Caja extends Model
{
    protected $table = 'cajas';

    protected $fillable = [
        'nombre',
        'acepta_efectivo',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'acepta_efectivo' => 'boolean',
            'activo' => 'boolean',
        ];
    }

    public function cuentasBancarias()
    {
        return $this->belongsToMany(CuentaBancaria::class, 'caja_cuenta_bancaria', 'caja_id', 'cuenta_bancaria_id')->withTimestamps();
    }

    public function billeteras()
    {
        return $this->belongsToMany(BilleteraDigital::class, 'caja_billetera', 'caja_id', 'billetera_id')->withTimestamps();
    }

    public function aperturas()
    {
        return $this->hasMany(AperturaCaja::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'id', 'caja_id');
    }
}
