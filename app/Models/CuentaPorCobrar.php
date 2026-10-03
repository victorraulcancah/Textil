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
        // De qué almacén (sucursal) es: cada una cobra y paga lo suyo.
        'almacen_id',
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

    /** Las letras de cambio emitidas desde esta cuenta. */
    public function letras()
    {
        return $this->hasMany(LetraCambio::class);
    }

    /**
     * Suma lo que hoy está en letras vigentes (`en_letras`). Lo que pasa a letras ya no se
     * cobra en la cuenta: se cobra con la letra, como si la cuenta se hubiera cancelado.
     */
    public function cargarEnLetras(): static
    {
        return $this->loadSum(['letras as en_letras' => fn ($q) => $q->where('estado', 'emitida')], 'saldo');
    }

    /** Lo que todavía se puede cobrar aquí: el saldo menos lo que pasó a letras. */
    public function saldoCobrable(): float
    {
        $enLetras = (float) ($this->en_letras ?? $this->letras()->where('estado', 'emitida')->sum('saldo'));

        return max(round((float) $this->saldo - $enLetras, 2), 0);
    }

    public function pagos()
    {
        return $this->hasMany(CuentaPorCobrarPago::class, 'cuenta_por_cobrar_id');
    }
}
