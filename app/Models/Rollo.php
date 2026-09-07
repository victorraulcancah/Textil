<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Un rollo físico de tela: la unidad individual de inventario.
 *
 * Nace en una recepción de compra, se le pega una etiqueta con su código y
 * desde ahí vive por su cuenta: se separa, se prepara, se despacha, se corta
 * y se vende, siempre conservando su código.
 */
class Rollo extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Rollo';

    /** Estados por los que pasa un rollo. */
    public const DISPONIBLE = 'disponible';
    public const SEPARADO = 'separado';
    public const EN_PREPARACION = 'en_preparacion';
    public const DESPACHADO = 'despachado';
    public const VENDIDO = 'vendido';
    public const AGOTADO = 'agotado';

    /** Etiqueta legible de cada estado, para pantallas y PDFs. */
    public const ESTADOS = [
        self::DISPONIBLE => 'Disponible',
        self::SEPARADO => 'Separado',
        self::EN_PREPARACION => 'En preparación',
        self::DESPACHADO => 'Despachado',
        self::VENDIDO => 'Vendido',
        self::AGOTADO => 'Agotado',
    ];

    protected $fillable = [
        'producto_id',
        'producto_color_id',
        'almacen_id',
        'codigo',
        'codigo_proveedor',
        'numero',
        'metros_inicial',
        'metros_actual',
        'peso_kg',
        'costo_unitario',
        'estado',
        'pasillo',
        'rack',
        'nivel',
        'posicion',
        'recepcion_compra_id',
        'cliente_id',
        'observaciones',
    ];

    protected function casts(): array
    {
        return [
            'numero' => 'integer',
            'metros_inicial' => 'decimal:2',
            'metros_actual' => 'decimal:2',
            'peso_kg' => 'decimal:3',
            'costo_unitario' => 'decimal:4',
        ];
    }

    public function producto()
    {
        return $this->belongsTo(Producto::class);
    }

    public function color()
    {
        return $this->belongsTo(ProductoColor::class, 'producto_color_id');
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function recepcion()
    {
        return $this->belongsTo(RecepcionCompra::class, 'recepcion_compra_id');
    }

    public function cliente()
    {
        return $this->belongsTo(Cliente::class);
    }

    public function movimientos()
    {
        return $this->hasMany(RolloMovimiento::class)->latest('id');
    }

    /** Pedidos en los que aparece este rollo. */
    public function lineasPedido()
    {
        return $this->hasMany(OrdenVentaRollo::class);
    }

    /** Solo los rollos que se pueden vender. */
    public function scopeDisponibles(Builder $query): Builder
    {
        return $query->where('estado', self::DISPONIBLE)->where('metros_actual', '>', 0);
    }

    /** Rollos cuyo metraje cae en un rango: "un azul entre 50 y 70 metros". */
    public function scopeEntreMetros(Builder $query, ?float $desde, ?float $hasta): Builder
    {
        return $query
            ->when($desde !== null, fn ($q) => $q->where('metros_actual', '>=', $desde))
            ->when($hasta !== null, fn ($q) => $q->where('metros_actual', '<=', $hasta));
    }

    /** ¿Se puede comprometer en un pedido nuevo? */
    public function estaDisponible(): bool
    {
        return $this->estado === self::DISPONIBLE && $this->metros_actual > 0;
    }

    /** "Almacén 01 / Pasillo A / Rack 03 / Nivel 02 / Pos 05" */
    public function ubicacionLegible(): string
    {
        $partes = array_filter([
            $this->almacen?->nombre,
            $this->pasillo ? "Pasillo {$this->pasillo}" : null,
            $this->rack ? "Rack {$this->rack}" : null,
            $this->nivel ? "Nivel {$this->nivel}" : null,
            $this->posicion ? "Pos. {$this->posicion}" : null,
        ]);

        return $partes ? implode(' / ', $partes) : 'Sin ubicación';
    }
}
