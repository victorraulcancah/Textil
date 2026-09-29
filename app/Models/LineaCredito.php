<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;

/**
 * Cuánto se le fía a un cliente: el límite en su moneda, hasta cuándo, a
 * cuántos días, y una ampliación temporal por importe o porcentaje.
 */
class LineaCredito extends Model
{
    use Auditable;

    public const CONTADO = 'contado';
    public const CREDITO = 'credito';

    public const AMPLIACION_IMPORTE = 'importe';
    public const AMPLIACION_PORCENTAJE = 'porcentaje';

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Línea de crédito';
    protected $table = 'lineas_credito';

    protected $fillable = [
        'cliente_id',
        'moneda',
        'limite',
        'fecha_aprobacion',
        'vigente_hasta',
        'activa',
        'condicion_venta',
        'dias_credito',
        'dias_gracia',
        'ampliacion_tipo',
        'ampliacion_valor',
        'ampliacion_hasta',
        'observaciones',
    ];

    protected function casts(): array
    {
        return [
            'limite' => 'decimal:2',
            'ampliacion_valor' => 'decimal:2',
            'fecha_aprobacion' => 'date:Y-m-d',
            'vigente_hasta' => 'date:Y-m-d',
            'ampliacion_hasta' => 'date:Y-m-d',
            'activa' => 'boolean',
            'dias_credito' => 'integer',
            'dias_gracia' => 'integer',
        ];
    }

    public function cliente()
    {
        return $this->belongsTo(Cliente::class);
    }

    /** Lo que suma la ampliación hoy, en la moneda de la línea; 0 si no hay o ya caducó. */
    public function ampliacionVigente(?Carbon $hoy = null): float
    {
        $hoy ??= today();

        if (! $this->ampliacion_tipo || (float) $this->ampliacion_valor <= 0) {
            return 0.0;
        }
        if ($this->ampliacion_hasta && $hoy->gt($this->ampliacion_hasta)) {
            return 0.0;
        }

        return $this->ampliacion_tipo === self::AMPLIACION_PORCENTAJE
            ? round((float) $this->limite * (float) $this->ampliacion_valor / 100, 2)
            : round((float) $this->ampliacion_valor, 2);
    }

    /** Por qué hoy no se le puede vender a crédito; null si sí se puede. */
    public function impedimento(?Carbon $hoy = null): ?string
    {
        $hoy ??= today();

        if (! $this->activa) {
            return 'La línea de crédito del cliente está suspendida.';
        }
        if ($this->condicion_venta !== self::CREDITO) {
            return 'El cliente compra al contado.';
        }
        if ($this->vigente_hasta && $hoy->gt($this->vigente_hasta)) {
            return 'La línea de crédito del cliente venció el '.$this->vigente_hasta->format('d/m/Y').'.';
        }

        return null;
    }
}
