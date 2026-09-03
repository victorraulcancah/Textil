<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubMarca extends Model
{
    protected $table = 'sub_marcas';

    protected $fillable = [
        'marca_id',
        'nombre',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
        ];
    }

    public function marca()
    {
        return $this->belongsTo(Marca::class);
    }

    public function productos()
    {
        return $this->hasMany(Producto::class);
    }
}
