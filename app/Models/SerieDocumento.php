<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SerieDocumento extends Model
{
    protected $table = 'series_documento';

    protected $fillable = [
        'tipo_documento',
        'serie',
        'numero_actual',
        'almacen_id',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'numero_actual' => 'integer',
            'activo' => 'boolean',
        ];
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }
}
