<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TarjetaBancaria extends Model
{
    protected $table = 'tarjetas_bancarias';

    protected $fillable = [
        'cuenta_bancaria_id',
        'tipo_tarjeta',
        'nombre_referencial',
        'numero_enmascarado',
        'marca',
        'fecha_vencimiento',
        'titular',
        'limite_credito',
        'estado',
    ];

    protected function casts(): array
    {
        return [
            'limite_credito' => 'decimal:2',
        ];
    }

    public function cuentaBancaria()
    {
        return $this->belongsTo(CuentaBancaria::class, 'cuenta_bancaria_id');
    }
}
