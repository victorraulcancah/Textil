<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Almacen extends Model
{
    protected $table = 'almacenes';

    protected $fillable = [
        'nombre',
        'codigo',
        'direccion',
        'tipo',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
        ];
    }

    public function stocks()
    {
        return $this->hasMany(ProductoAlmacenStock::class);
    }

    public function movimientos()
    {
        return $this->hasMany(MovimientoInventario::class);
    }

    public function transferenciasOrigen()
    {
        return $this->hasMany(Transferencia::class, 'almacen_origen_id');
    }

    public function transferenciasDestino()
    {
        return $this->hasMany(Transferencia::class, 'almacen_destino_id');
    }

    public function ajustes()
    {
        return $this->hasMany(AjusteInventario::class);
    }

    public function tomas()
    {
        return $this->hasMany(TomaInventario::class);
    }
}
