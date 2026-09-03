<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DevolucionProveedor extends Model
{
    protected $table = 'devoluciones_proveedor';

    protected $fillable = [
        'recepcion_compra_id',
        'proveedor_id',
        'almacen_id',
        'motivo',
        'estado',
        'fecha',
        'observaciones',
    ];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
        ];
    }

    public function recepcionCompra()
    {
        return $this->belongsTo(RecepcionCompra::class);
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function detalles()
    {
        return $this->hasMany(DevolucionProveedorDetalle::class);
    }
}
