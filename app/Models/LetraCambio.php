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
        'banco', 'oficina', 'cuenta', 'dc', 'estado', 'usuario_id',
    ];

    protected function casts(): array
    {
        return [
            'fecha_giro' => 'date:Y-m-d',
            'fecha_vencimiento' => 'date:Y-m-d',
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
