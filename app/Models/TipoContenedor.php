<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** Tipo y tamaño de contenedor de una compra al exterior: "40 HC", "20 GP"… */
class TipoContenedor extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Tipo de contenedor';
    protected $table = 'tipos_contenedor';

    protected $fillable = ['nombre', 'activo'];

    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }
}
