<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MovimientoCaja extends Model
{
    protected $table = 'movimientos_caja';

    protected $fillable = [
        'apertura_caja_id',
        'tipo',
        'motivo_movimiento_id',
        'metodo_pago_id',
        'cuenta_bancaria_id',
        'tarjeta_id',
        'billetera_id',
        'numero_operacion',
        'captura_url',
        'monto',
        'descripcion',
        'documento_referencia_tipo',
        'documento_referencia_id',
        'fecha',
    ];

    protected function casts(): array
    {
        return [
            'monto' => 'decimal:2',
            'fecha' => 'date',
        ];
    }

    public function apertura()
    {
        return $this->belongsTo(AperturaCaja::class, 'apertura_caja_id');
    }

    public function motivo()
    {
        return $this->belongsTo(MotivoMovimiento::class, 'motivo_movimiento_id');
    }

    public function metodoPago()
    {
        return $this->belongsTo(MetodoPago::class, 'metodo_pago_id');
    }

    public function cuentaBancaria()
    {
        return $this->belongsTo(CuentaBancaria::class, 'cuenta_bancaria_id');
    }

    public function tarjeta()
    {
        return $this->belongsTo(TarjetaBancaria::class, 'tarjeta_id');
    }

    public function billetera()
    {
        return $this->belongsTo(BilleteraDigital::class, 'billetera_id');
    }
}
