<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** Concepto de un gasto adicional de la compra: SEGURO, AGENTE DE ADUANA, TRANSPORTE LOCAL… */
class ConceptoGasto extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Concepto de gasto';
    protected $table = 'conceptos_gasto';

    protected $fillable = ['nombre', 'activo'];

    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }
}
