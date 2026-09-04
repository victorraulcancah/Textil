<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class DevolucionProveedor extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Devolución a proveedor';
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
