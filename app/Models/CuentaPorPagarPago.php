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
        'moneda',
        // Pagada en soles una deuda en otra moneda: cuánto salió en soles y a
        // qué tipo de cambio del día. `monto` es lo que eso abona, en `moneda`.
        'monto_pen',
        'tipo_cambio',
        'movimiento_caja_id',
        'referencia',
        // Lo que se escribe para explicar el abono ("CANC D: PF002-001, CLIENTE"); es también la descripción en caja.
        'glosa',
        'fecha',
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
