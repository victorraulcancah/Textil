<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/**
 * Una letra de cambio emitida desde una cuenta por cobrar. Guarda los datos
 * del aceptante y del aval tal como estaban al emitirla.
 */
class LetraCambio extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Letra de cambio';
    protected $table = 'letras_cambio';

    protected $fillable = [
        // De qué almacén (sucursal) es: cada una cobra y paga lo suyo.
        'almacen_id',
        'numero', 'cuenta_por_cobrar_id', 'cliente_id', 'referencia', 'fecha_giro', 'lugar_giro',
        'fecha_vencimiento', 'moneda', 'importe', 'saldo', 'monto_pagado', 'letra_anterior_id', 'serie_letra', 'serie_renovacion',
        'aceptante_nombre', 'aceptante_documento', 'aceptante_domicilio', 'aceptante_localidad', 'aceptante_telefono',
        'aval_nombre', 'aval_documento', 'aval_domicilio', 'aval_localidad',
        'concepto', 'aval2_nombre', 'aval2_documento', 'aval2_domicilio', 'aval2_localidad',
        'banco', 'oficina', 'cuenta', 'dc', 'estado', 'sub_estado', 'fecha_pago', 'usuario_id',
    ];

    /** Dónde está la letra mientras se cobra. Nace "en cartera". */
    public const SUB_ESTADOS = [
        'en_cartera' => 'En cartera',
        'cobranza_libre' => 'Cobranza libre - Banco',
        'en_descuento' => 'Letras en descuento - Bancos',
    ];

    /** El código del documento sale con la serie: LT001-001, LT001-002… */
    protected $appends = ['codigo'];

    public const SERIE = 'LT001';

    /**
     * El código del documento: LT001-NNN para una letra y RV001-NNN para una renovación (que es
     * otro documento y no lleva serie de letra).
     */
    public function getCodigoAttribute(): string
    {
        return $this->serie_letra ?? $this->serie_renovacion ?? self::SERIE.'-'.str_pad((string) $this->numero, 3, '0', STR_PAD_LEFT);
    }

    protected function casts(): array
    {
        return [
            'fecha_giro' => 'date:Y-m-d',
            'fecha_vencimiento' => 'date:Y-m-d',
            'fecha_pago' => 'date:Y-m-d',
            'importe' => 'decimal:2',
            'saldo' => 'decimal:2',
            'monto_pagado' => 'decimal:2',
        ];
    }

    public function cuentaPorCobrar()
    {
        return $this->belongsTo(CuentaPorCobrar::class);
    }

    /** La letra que se renovó para dar origen a esta (si nació de una renovación). */
    public function anterior()
    {
        return $this->belongsTo(self::class, 'letra_anterior_id');
    }

    /** La letra que renovó a esta. */
    public function renovacion()
    {
        return $this->hasOne(self::class, 'letra_anterior_id');
    }

    public function cliente()
    {
        return $this->belongsTo(Cliente::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    /** Días entre el giro y el vencimiento. */
    public function plazoDias(): int
    {
        return (int) $this->fecha_giro->diffInDays($this->fecha_vencimiento);
    }
}
