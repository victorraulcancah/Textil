<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UnidadMedida extends Model
{
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
