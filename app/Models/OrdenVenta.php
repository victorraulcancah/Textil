<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/**
 * El pedido del cliente: reserva rollos pero no mueve stock.
 *
 * Camina por estados hasta el despacho; recién la nota de venta descuenta
 * del almacén. Anularlo devuelve los rollos a disponible sin dejar rastro
 * en el inventario, porque nunca salieron.
 */
class OrdenVenta extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Pedido';
    protected $table = 'ordenes_venta';

    /** Estados del pedido. */
    public const BORRADOR = 'borrador';
    public const SEPARADA = 'separada';
    public const EN_PREPARACION = 'en_preparacion';
    public const DESPACHADA = 'despachada';
    public const FACTURADA = 'facturada';
    public const ANULADA = 'anulada';

    public const ESTADOS = [
        self::BORRADOR => 'Borrador',
        self::SEPARADA => 'Separada',
        self::EN_PREPARACION => 'En preparación',
        self::DESPACHADA => 'Despachada',
        self::FACTURADA => 'Facturada',
        self::ANULADA => 'Anulada',
    ];

    /**
     * En qué estado queda cada rollo según el estado del pedido. El rollo no
     * se mueve a mano: sigue al documento que lo tiene comprometido.
     */
    public const ESTADO_ROLLO = [
        self::BORRADOR => Rollo::DISPONIBLE,
        self::SEPARADA => Rollo::SEPARADO,
        self::EN_PREPARACION => Rollo::EN_PREPARACION,
        self::DESPACHADA => Rollo::DESPACHADO,
        self::FACTURADA => Rollo::VENDIDO,
        self::ANULADA => Rollo::DISPONIBLE,
    ];

    /** A qué estados puede pasar el pedido desde el actual. */
    public const TRANSICIONES = [
        self::BORRADOR => [self::SEPARADA, self::ANULADA],
        self::SEPARADA => [self::EN_PREPARACION, self::BORRADOR, self::ANULADA],
        self::EN_PREPARACION => [self::DESPACHADA, self::SEPARADA, self::ANULADA],
        self::DESPACHADA => [self::FACTURADA, self::ANULADA],
        self::FACTURADA => [],
        self::ANULADA => [],
    ];

    protected $fillable = [
        'serie',
        'numero',
        'cliente_id',
        'almacen_id',
        'vendedor_id',
        'fecha_emision',
        'fecha_entrega',
        'estado',
        'moneda',
        'subtotal',
        'descuento_total',
        'total',
        'requerimiento_numero',
        'fecha_separacion',
        'fecha_preparacion',
        'fecha_despacho',
        'usuario_prepara_id',
        'usuario_despacha_id',
        'motivo_anulacion',
        'usuario_anula_id',
        'fecha_anulacion',
        'observaciones',
    ];

    protected function casts(): array
    {
        return [
            'fecha_emision' => 'date',
            'fecha_entrega' => 'date',
            'fecha_separacion' => 'datetime',
            'fecha_preparacion' => 'datetime',
            'fecha_despacho' => 'datetime',
            'fecha_anulacion' => 'datetime',
            'subtotal' => 'decimal:2',
            'descuento_total' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    public function cliente()
    {
        return $this->belongsTo(Cliente::class);
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function vendedor()
    {
        return $this->belongsTo(User::class, 'vendedor_id');
    }

    public function usuarioPrepara()
    {
        return $this->belongsTo(User::class, 'usuario_prepara_id');
    }

    public function usuarioDespacha()
    {
        return $this->belongsTo(User::class, 'usuario_despacha_id');
    }

    public function detalles()
    {
        return $this->hasMany(OrdenVentaRollo::class);
    }

    public function notaVenta()
    {
        return $this->hasOne(NotaVenta::class);
    }

    /** "OV-000125" */
    public function getDocumentoAttribute(): string
    {
        return "{$this->serie}-{$this->numero}";
    }

    public function puedePasarA(string $estado): bool
    {
        return in_array($estado, self::TRANSICIONES[$this->estado] ?? [], true);
    }

    /** Mientras es borrador se le pueden agregar y quitar rollos. */
    public function esEditable(): bool
    {
        return $this->estado === self::BORRADOR;
    }

    /** ¿El almacenero ya escaneó todos los rollos del pedido? */
    public function estaVerificada(): bool
    {
        return $this->detalles()->whereNull('escaneado_at')->doesntExist();
    }
}
