<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class CierreCaja extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Cierre de caja';
    protected $table = 'cierres_caja';

    protected $fillable = [
        'apertura_caja_id',
        'monto_sistema',
        'monto_contado',
        'diferencia',
        // Los dólares se arquean aparte de los soles.
        'monto_sistema_usd',
        'monto_contado_usd',
        'diferencia_usd',
        'fecha_cierre',
        // Lo que queda en el cajón para el turno siguiente y lo que sale de la caja al cerrar.
        'monto_dejado',
        'monto_retirado',
        // pendiente → aprobado | anulado.
        'estado',
        'movimiento_caja_id',
        'aprobado_por',
        'aprobado_en',
        'anulado_por',
        'anulado_en',
        'anulado_motivo',
        // A qué caja va el efectivo retirado (si va a alguna) y el ingreso que se creó allí al aprobar.
        'caja_destino_id',
        'movimiento_destino_id',
    ];

    public const PENDIENTE = 'pendiente';
    public const APROBADO = 'aprobado';
    public const ANULADO = 'anulado';

    protected function casts(): array
    {
        return [
            'monto_sistema' => 'decimal:2',
            'monto_contado' => 'decimal:2',
            'diferencia' => 'decimal:2',
            'monto_sistema_usd' => 'decimal:2',
            'monto_contado_usd' => 'decimal:2',
            'diferencia_usd' => 'decimal:2',
            'fecha_cierre' => 'datetime',
            'monto_dejado' => 'decimal:2',
            'monto_retirado' => 'decimal:2',
            'aprobado_en' => 'datetime',
            'anulado_en' => 'datetime',
        ];
    }

    /** Con lo que abre quien sigue: lo que se dejó; en cierres anteriores, todo lo contado. */
    public function efectivoParaElSiguiente(): float
    {
        return round((float) ($this->monto_dejado ?? $this->monto_contado), 2);
    }

    public function cajaDestino()
    {
        return $this->belongsTo(Caja::class, 'caja_destino_id');
    }

    public function movimientoDestino()
    {
        return $this->belongsTo(MovimientoCaja::class, 'movimiento_destino_id')->withTrashed();
    }

    public function movimiento()
    {
        return $this->belongsTo(MovimientoCaja::class, 'movimiento_caja_id')->withTrashed();
    }

    public function aprobador()
    {
        return $this->belongsTo(User::class, 'aprobado_por');
    }

    public function anulador()
    {
        return $this->belongsTo(User::class, 'anulado_por');
    }

    public function apertura()
    {
        return $this->belongsTo(AperturaCaja::class, 'apertura_caja_id');
    }
}
