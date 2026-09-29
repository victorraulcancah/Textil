<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class CuentaPorCobrar extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Cuenta por cobrar';
    protected $table = 'cuentas_por_cobrar';

    protected $fillable = [
        'nota_venta_id',
        'cliente_id',
        // Cada cuota de una venta a crédito es su propia cuenta.
        'numero_cuota',
        'total_cuotas',
        'monto_total',
        'moneda',
        'monto_pagado',
        'saldo',
        'fecha_vencimiento',
        'estado',
    ];

    protected function casts(): array
    {
        return [
            'monto_total' => 'decimal:2',
            'monto_pagado' => 'decimal:2',
            'saldo' => 'decimal:2',
            'fecha_vencimiento' => 'date',
            'numero_cuota' => 'integer',
            'total_cuotas' => 'integer',
        ];
    }

    public function notaVenta()
    {
        return $this->belongsTo(NotaVenta::class);
    }

    public function cliente()
    {
        return $this->belongsTo(Cliente::class);
    }

    public function pagos()
    {
        return $this->hasMany(CuentaPorCobrarPago::class, 'cuenta_por_cobrar_id');
    }
}
