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
        // Texto libre, de antes de tener el árbol de ubicaciones. Se sigue
        // mostrando en los rollos viejos que ya lo tenían así.
        'pasillo',
        'rack',
        'nivel',
        'posicion',
        // La ubicación estructurada (piso → pasillo → rack → nivel →
        // posición), cuando el almacén ya tiene su árbol configurado.
        'almacen_ubicacion_id',
        'recepcion_compra_id',
        // Quién lo escaneó al recibirlo en el almacén.
        'usuario_recibe_id',
        'importacion_id',
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

    /** El almacenero que lo escaneó al recibirlo. */
    public function usuarioRecibe()
    {
        return $this->belongsTo(User::class, 'usuario_recibe_id');
    }

    public function cliente()
    {
        return $this->belongsTo(Cliente::class);
    }

    /** El embarque del que llegó este rollo, si se registró al recibirlo. */
    public function importacion()
    {
        return $this->belongsTo(Importacion::class);
    }

    /** La ubicación estructurada, si el almacén ya tiene su árbol armado. */
    public function ubicacion()
    {
        return $this->belongsTo(AlmacenUbicacion::class, 'almacen_ubicacion_id');
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

    /**
     * "Almacén Principal / Piso 1 / Pasillo A / Rack 03" con el árbol de
     * ubicaciones, o el texto libre de siempre en los rollos que no lo usan.
     */
    public function ubicacionLegible(): string
    {
        if ($this->almacen_ubicacion_id) {
            $ubicacion = $this->relationLoaded('ubicacion') ? $this->ubicacion : $this->ubicacion()->first();
            $partes = array_filter([$this->almacen?->nombre, $ubicacion?->rutaLegible()]);

            return $partes ? implode(' / ', $partes) : 'Sin ubicación';
        }

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
