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
        // Lo que abona a la venta, en la moneda de la venta.
        'monto',
        'moneda',
        // Si pagó con soles una venta en dólares: cuánto y a qué tipo de cambio.
        'monto_pen',
        'tipo_cambio',
        'fecha',
        'referencia',
    ];

    protected function casts(): array
    {
        return [
            'monto' => 'decimal:2',
            'monto_pen' => 'decimal:2',
            'tipo_cambio' => 'decimal:4',
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
