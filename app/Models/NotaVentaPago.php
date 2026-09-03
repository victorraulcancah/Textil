<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotaVentaPago extends Model
{
    protected $table = 'nota_venta_pagos';

    protected $fillable = [
        'nota_venta_id',
        'metodo_pago_id',
        'forma_pago',
        'cuenta_bancaria_id',
        'billetera_id',
        'monto',
        'fecha',
        'referencia',
    ];

    protected function casts(): array
    {
        return [
            'monto' => 'decimal:2',
            'fecha' => 'date',
        ];
    }

    public function notaVenta()
    {
        return $this->belongsTo(NotaVenta::class);
    }

    public function metodoPago()
    {
        return $this->belongsTo(MetodoPago::class);
    }
}
