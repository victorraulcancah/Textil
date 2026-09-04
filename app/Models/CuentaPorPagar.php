<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class CuentaPorPagar extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Cuenta por pagar';
    protected $table = 'cuentas_por_pagar';

    protected $fillable = [
        'recepcion_compra_id',
        'compra_id',
        'proveedor_id',
        'monto_total',
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
        ];
    }

    public function recepcionCompra()
    {
        return $this->belongsTo(RecepcionCompra::class);
    }

    /** Compra al crédito que originó la deuda (alternativa a la recepción). */
    public function compra()
    {
        return $this->belongsTo(Compra::class);
    }

    public function proveedor()
    {
        return $this->belongsTo(Proveedor::class);
    }

    public function pagos()
    {
        return $this->hasMany(CuentaPorPagarPago::class, 'cuenta_por_pagar_id');
    }
}
