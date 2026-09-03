<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MetodoPago extends Model
{
    protected $table = 'metodos_pago';

    protected $fillable = [
        'nombre',
        'tipo',
        'es_sistema',
        'requiere_cuenta_bancaria',
        'requiere_tarjeta',
        'requiere_numero_operacion',
        'requiere_captura',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'es_sistema' => 'boolean',
            'requiere_cuenta_bancaria' => 'boolean',
            'requiere_tarjeta' => 'boolean',
            'requiere_numero_operacion' => 'boolean',
            'requiere_captura' => 'boolean',
            'activo' => 'boolean',
        ];
    }
}
