<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Marca extends Model
{
    protected $table = 'marcas';

    protected $fillable = [
        'nombre',
        'logo',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
        ];
    }

    public function subMarcas()
    {
        return $this->hasMany(SubMarca::class);
    }

    public function productos()
    {
        return $this->hasMany(Producto::class);
    }
}
