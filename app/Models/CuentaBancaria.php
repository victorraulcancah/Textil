<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CuentaBancaria extends Model
{
    protected $table = 'cuentas_bancarias';

    protected $fillable = [
        'banco_id',
        'alias',
        'numero_cuenta',
        'cci',
        'titular',
        'moneda',
        'tipo_cuenta',
        'activo',
    ];

    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }

    public function banco()
    {
        return $this->belongsTo(Banco::class);
    }

    public function tarjetas()
    {
        return $this->hasMany(TarjetaBancaria::class);
    }
}
