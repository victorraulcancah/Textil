<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Proveedor extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Proveedor';
    protected $table = 'proveedores';

    protected $fillable = [
        'nombre',
        'codigo',
        'ruc',
        'direccion',
        'telefono',
        'email',
        'contacto_nombre',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
        ];
    }

    public function ordenesCompra()
    {
        return $this->hasMany(OrdenCompra::class);
    }
}
