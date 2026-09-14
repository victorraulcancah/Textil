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
        // Código corto (3 caracteres) con el que el cliente arma su propia
        // numeración de orden de compra: KET-001-26.
        'codigo_corto',
        'ruc',
        // Identificador tributario del proveedor extranjero: no todos usan
        // RUC peruano.
        'tax_id',
        'pais',
        'direccion',
        'telefono',
        'fax',
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
