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
        'fecha_cierre',
    ];

    protected function casts(): array
    {
        return [
            'monto_sistema' => 'decimal:2',
            'monto_contado' => 'decimal:2',
            'diferencia' => 'decimal:2',
            'fecha_cierre' => 'datetime',
        ];
    }

    public function apertura()
    {
        return $this->belongsTo(AperturaCaja::class, 'apertura_caja_id');
    }
}
