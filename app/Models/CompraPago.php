<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CompraPago extends Model
{
    protected $table = 'compra_pagos';

    protected $fillable = [
        'compra_id',
        'metodo',
        'cuenta_bancaria_id',
        'billetera_id',
        'monto',
        'moneda',
        // Pagado en soles una compra en otra moneda: cuánto salió en soles y
        // a qué tipo de cambio. `monto` es lo que eso abona, en `moneda`.
        'monto_pen',
        'tipo_cambio',
    ];

    protected function casts(): array
    {
        return [
            'monto' => 'decimal:2',
            'monto_pen' => 'decimal:2',
            'tipo_cambio' => 'decimal:4',
        ];
    }

    public function compra()
    {
        return $this->belongsTo(Compra::class);
    }
}
