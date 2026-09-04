<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class SolicitudCompra extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Solicitud de compra';
    protected $table = 'solicitudes_compra';

    protected $fillable = [
        'codigo',
        'fecha_solicitud',
        'usuario_solicita_id',
        'usuario_aprueba_id',
        'estado',
        'observaciones',
    ];

    protected function casts(): array
    {
        return [
            'fecha_solicitud' => 'datetime',
        ];
    }

    public function usuarioSolicita()
    {
        return $this->belongsTo(User::class, 'usuario_solicita_id');
    }

    public function usuarioAprueba()
    {
        return $this->belongsTo(User::class, 'usuario_aprueba_id');
    }

    public function detalles()
    {
        return $this->hasMany(SolicitudCompraDetalle::class, 'solicitud_id');
    }

    public function ordenesCompra()
    {
        return $this->hasMany(OrdenCompra::class);
    }
}
