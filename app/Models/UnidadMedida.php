<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class UnidadMedida extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Unidad de medida';
    protected $table = 'unidades_medida';

    protected $fillable = [
        'nombre',
        'abreviatura',
        'factor_base',
    ];

    protected function casts(): array
    {
        return ['factor_base' => 'decimal:4'];
    }

    public function productos()
    {
        return $this->hasMany(Producto::class);
    }
}
