<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class MotivoMovimiento extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Motivo de movimiento';
    protected $table = 'motivos_movimiento';

    protected $fillable = [
        'nombre',
        'tipo',
        'ambito',
        'categoria_gasto',
        'es_sistema',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'es_sistema' => 'boolean',
            'activo' => 'boolean',
        ];
    }
}
