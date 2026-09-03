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
    ];

    protected function casts(): array
    {
        return [
            'monto' => 'decimal:2',
        ];
    }

    public function compra()
    {
        return $this->belongsTo(Compra::class);
    }
}
