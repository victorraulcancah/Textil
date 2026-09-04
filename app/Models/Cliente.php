<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Cliente extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Cliente';
    protected $table = 'clientes';

    protected $fillable = [
        'nombre',
        'tipo_documento',
        'numero_documento',
        'direccion',
        'telefono',
        'email',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
        ];
    }
}
