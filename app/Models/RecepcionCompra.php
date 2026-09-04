<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class RecepcionCompra extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Recepción de compra';
    protected $table = 'recepciones_compra';

    /** Serie del documento formal de recepción. */
    public const SERIE = 'RC01';

    protected $fillable = [
        'orden_compra_id',
        'compra_id',
        'proveedor_id',
        'almacen_id',
        'serie',
        'numero',
        'numero_documento',
        'tipo_documento',
        'fecha_recepcion',
        'estado',
        'activo',
        'stock_aplicado',
        'usuario_recibe_id',
        'observaciones',
    ];

    protected $appends = ['documento'];

    protected function casts(): array
    {
        return [
            'fecha_recepcion' => 'datetime',
            'stock_aplicado' => 'boolean',
            'activo' => 'boolean',
        ];
    }

    /** Número formal del documento de recepción, ej. "RC01-0024". */
    public function getDocumentoAttribute(): ?string
    {
        if (! $this->serie || ! $this->numero) {
            return null;
        }

        return "{$this->serie}-{$this->numero}";
    }

    public function ordenCompra()
    {
        return $this->belongsTo(OrdenCompra::class);
    }

    public function compra()
    {
        return $this->belongsTo(Compra::class);
    }

    public function proveedor()
    {
        return $this->belongsTo(Proveedor::class);
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function usuarioRecibe()
    {
        return $this->belongsTo(User::class, 'usuario_recibe_id');
    }

    public function detalles()
    {
        return $this->hasMany(RecepcionCompraDetalle::class, 'recepcion_id');
    }

    public function devoluciones()
    {
        return $this->hasMany(DevolucionProveedor::class);
    }
}
