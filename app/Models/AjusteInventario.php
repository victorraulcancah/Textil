<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AjusteInventario extends Model
{
    protected $table = 'ajustes_inventario';

    /** Serie del correlativo formal de ajustes. */
    public const SERIE = 'AJ01';

    protected $fillable = [
        'serie',
        'numero',
        'almacen_id',
        'proveedor_id',
        'tipo',
        'motivo',
        'estado',
        'usuario_solicita_id',
        'usuario_aprueba_id',
        'fecha',
        'observaciones',
        'total',
    ];

    protected $appends = ['documento'];

    protected static function booted(): void
    {
        static::creating(function (self $ajuste) {
            if (!$ajuste->usuario_solicita_id && auth()->check()) {
                $ajuste->usuario_solicita_id = auth()->id();
            }
        });
    }

    protected function casts(): array
    {
        return [
            'fecha' => 'datetime',
            'total' => 'decimal:2',
        ];
    }

    /** Número formal del ajuste, ej. "AJ01-0001". */
    public function getDocumentoAttribute(): ?string
    {
        return $this->serie && $this->numero ? "{$this->serie}-{$this->numero}" : null;
    }

    public function proveedor()
    {
        return $this->belongsTo(Proveedor::class);
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
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
        return $this->hasMany(AjusteDetalle::class, 'ajuste_id');
    }
}
