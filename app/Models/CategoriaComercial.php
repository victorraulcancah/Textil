<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** Cómo se clasifica al cliente: A, B, Mayorista… */
class CategoriaComercial extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Categoría comercial';
    protected $table = 'categorias_comerciales';

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
