<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/**
 * El tipo de cambio de un día: el de SUNAT (compra y venta), que el sistema
 * trae solo, y el comercial, que la empresa pone para cobrar en soles.
 */
class TipoCambio extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Tipo de cambio';
    protected $table = 'tipos_cambio';

    protected $fillable = ['fecha', 'compra', 'venta', 'comercial'];

    protected function casts(): array
    {
        return [
            'fecha' => 'date:Y-m-d',
            'compra' => 'decimal:4',
            'venta' => 'decimal:4',
            'comercial' => 'decimal:4',
        ];
    }
}
