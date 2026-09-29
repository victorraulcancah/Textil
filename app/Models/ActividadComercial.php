<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** A qué se dedica el cliente: confección, distribución… */
class ActividadComercial extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Actividad comercial';
    protected $table = 'actividades_comerciales';

    protected $fillable = ['nombre', 'activo'];

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
        ];
    }

    public function clientes()
    {
        return $this->hasMany(Cliente::class);
    }
}
