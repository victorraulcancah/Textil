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
        'tipo',
        'proveedor_id',
        'solicitud_id',
        'fecha_emision',
        'fecha_entrega_estimada',
        'estado',
        'usuario_crea_id',
        'usuario_aprueba_id',
        'fecha_aprobacion',
        'usuario_envia_id',
        'fecha_envio',
        'observaciones',
        'condicion_pago',
        'moneda',
        'tipo_cambio',
        // Solo se llenan cuando tipo = exterior: es una compra de importación.
        'cargo_type',
        'medio_transporte',
        'incoterm',
        'pais_origen',
        'pais_destino',
        'puerto_embarque',
        'puerto_destino',
        'numero_contenedor',
        'fecha_embarque_estimada',
        'elaborado_por',
        'aprobado_por',
    ];

    protected function casts(): array
    {
        return [
            'fecha_emision' => 'datetime',
            'fecha_entrega_estimada' => 'datetime',
            'fecha_embarque_estimada' => 'date',
            'fecha_aprobacion' => 'datetime',
            'fecha_envio' => 'datetime',
            'tipo_cambio' => 'decimal:4',
        ];
    }

    public function proveedor()
    {
        return $this->belongsTo(Proveedor::class);
    }

    /** ¿Es una compra de importación? Solo ahí aplican los campos de embarque. */
    public function esExterior(): bool
    {
        return $this->tipo === 'exterior';
    }

    public function solicitud()
    {
        return $this->belongsTo(SolicitudCompra::class);
    }

    public function usuarioCrea()
    {
        return $this->belongsTo(User::class, 'usuario_crea_id');
    }

    public function usuarioAprueba()
    {
        return $this->belongsTo(User::class, 'usuario_aprueba_id');
    }

    public function usuarioEnvia()
    {
        return $this->belongsTo(User::class, 'usuario_envia_id');
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
