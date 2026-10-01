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
        'numero', 'cuenta_por_cobrar_id', 'cliente_id', 'referencia', 'fecha_giro', 'lugar_giro',
        'fecha_vencimiento', 'moneda', 'importe',
        'aceptante_nombre', 'aceptante_documento', 'aceptante_domicilio', 'aceptante_localidad', 'aceptante_telefono',
        'aval_nombre', 'aval_documento', 'aval_domicilio', 'aval_localidad',
        'banco', 'oficina', 'cuenta', 'dc', 'estado', 'sub_estado', 'fecha_pago', 'usuario_id',
    ];

    /** Dónde está la letra mientras se cobra. Nace "en cartera". */
    public const SUB_ESTADOS = [
        'en_cartera' => 'En cartera',
        'cobranza_libre' => 'Cobranza libre',
        'cobranza_banco' => 'Cobranza banco',
        'en_descuento' => 'Letras en descuento',
    ];

    protected function casts(): array
    {
        return [
            'fecha_giro' => 'date:Y-m-d',
            'fecha_vencimiento' => 'date:Y-m-d',
            'fecha_pago' => 'date:Y-m-d',
            'importe' => 'decimal:2',
        ];
    }

    public function cuentaPorCobrar()
    {
        return $this->belongsTo(CuentaPorCobrar::class);
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
