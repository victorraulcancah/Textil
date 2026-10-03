<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CuentaPorCobrarPago extends Model
{
    protected $table = 'cuentas_por_cobrar_pagos';

    protected $fillable = [
        'cuenta_por_cobrar_id',
        'forma_pago',
        'cuenta_bancaria_id',
        'billetera_id',
        // Lo que abona a la deuda, en la moneda de la deuda.
        'monto',
        'moneda',
        // Si pagó con soles una deuda en dólares: cuánto y a qué tipo de cambio.
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

    public function cuentaPorCobrar()
    {
        return $this->belongsTo(CuentaPorCobrar::class, 'cuenta_por_cobrar_id');
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
