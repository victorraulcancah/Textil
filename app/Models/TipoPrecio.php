<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/**
 * Un tipo de precio: Minorista, Mayorista, Distribuidor…
 *
 * El principal es el precio de siempre (el `precio_venta` de cada
 * presentación). Los demás, y los precios por cantidad, viven en
 * `producto_precios`.
 */
class TipoPrecio extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Tipo de precio';
    protected $table = 'tipos_precio';

    protected $fillable = ['nombre', 'margen', 'principal', 'orden', 'activo'];

    protected function casts(): array
    {
        return [
            'margen' => 'decimal:2',
            'principal' => 'boolean',
            'activo' => 'boolean',
        ];
    }

    /** El tipo de precio que usan los clientes sin uno asignado. */
    public static function principal(): ?self
    {
        return static::where('principal', true)->first();
    }

    public function precios()
    {
        return $this->hasMany(ProductoPrecio::class);
    }

    public function clientes()
    {
        return $this->hasMany(Cliente::class);
    }
}
