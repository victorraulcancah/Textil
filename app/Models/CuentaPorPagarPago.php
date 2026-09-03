<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CuentaPorPagarPago extends Model
{
    protected $table = 'cuentas_por_pagar_pagos';

    protected $fillable = [
        'cuenta_por_pagar_id',
        'forma_pago',
        'cuenta_bancaria_id',
        'billetera_id',
        'monto',
        'movimiento_caja_id',
        'referencia',
        'fecha',
    ];

    protected function casts(): array
    {
        return [
            'monto' => 'decimal:2',
            'fecha' => 'date',
        ];
    }

    public function cuentaPorPagar()
    {
        return $this->belongsTo(CuentaPorPagar::class, 'cuenta_por_pagar_id');
    }

    public function cuentaBancaria()
    {
        return $this->belongsTo(CuentaBancaria::class, 'cuenta_bancaria_id');
    }

    public function billetera()
    {
        return $this->belongsTo(BilleteraDigital::class, 'billetera_id');
    }

    public function movimientoCaja()
    {
        return $this->belongsTo(MovimientoCaja::class, 'movimiento_caja_id');
    }
}
