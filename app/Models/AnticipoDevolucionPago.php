<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Un método con el que se devolvió parte de un anticipo (efectivo, transferencia o billetera) y su egreso de caja. */
class AnticipoDevolucionPago extends Model
{
    protected $table = 'anticipo_devolucion_pagos';

    protected $fillable = [
        'devolucion_id',
        'forma_pago',
        'cuenta_bancaria_id',
        'billetera_id',
        'monto',
        'referencia',
        'movimiento_caja_id',
    ];

    protected function casts(): array
    {
        return ['monto' => 'decimal:2'];
    }

    public function devolucion()
    {
        return $this->belongsTo(AnticipoDevolucion::class, 'devolucion_id');
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
        return $this->belongsTo(MovimientoCaja::class, 'movimiento_caja_id')->withTrashed()->withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS);
    }
}
