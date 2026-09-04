<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class OrdenCompra extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Orden de compra';
    protected $table = 'ordenes_compra';

    protected $fillable = [
        'codigo',
        'proveedor_id',
        'solicitud_id',
        'fecha_emision',
        'fecha_entrega_estimada',
        'estado',
        'usuario_crea_id',
        'observaciones',
        'condicion_pago',
        'moneda',
        'tipo_cambio',
    ];

    protected function casts(): array
    {
        return [
            'fecha_emision' => 'datetime',
            'fecha_entrega_estimada' => 'datetime',
            'tipo_cambio' => 'decimal:4',
        ];
    }

    public function proveedor()
    {
        return $this->belongsTo(Proveedor::class);
    }

    public function solicitud()
    {
        return $this->belongsTo(SolicitudCompra::class);
    }

    public function usuarioCrea()
    {
        return $this->belongsTo(User::class, 'usuario_crea_id');
    }

    public function detalles()
    {
        return $this->hasMany(OrdenCompraDetalle::class);
    }

    public function recepciones()
    {
        return $this->hasMany(RecepcionCompra::class);
    }

    /** Compras generadas a partir de esta orden. */
    public function compras()
    {
        return $this->hasMany(Compra::class);
    }
}
