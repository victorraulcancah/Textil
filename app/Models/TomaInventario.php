<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class TomaInventario extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Toma de inventario';
    protected $table = 'tomas_inventario';

    protected $fillable = [
        'almacen_id',
        'fecha',
        'estado',
        'usuario_id',
        'observaciones',
    ];

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
        ];
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class);
    }

    public function detalles()
    {
        return $this->hasMany(TomaInventarioDetalle::class, 'toma_id');
    }
}
