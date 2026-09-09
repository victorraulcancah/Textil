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
    public const SOLICITADO = 'solicitado';
    public const PREPARANDO = 'preparando';
    public const SEPARADO = 'separado';
    public const DESPACHADO = 'despachado';
    public const FACTURADO = 'facturado';
    public const ANULADO = 'anulado';

    public const ESTADOS = [
        self::BORRADOR => 'Borrador',
        // El vendedor lo solicita al almacén: ahí se numera el requerimiento y
        // el pedido aparece en la bandeja del almacenero.
        self::SOLICITADO => 'Solicitado',
        // Se pone solo, en cuanto el almacenero escanea el primer rollo: si ya
        // está bajando tela del rack, el pedido está en preparación.
        self::PREPARANDO => 'Preparando',
        // Los rollos ya están apartados y verificados, esperando su salida.
        self::SEPARADO => 'Separado',
        self::DESPACHADO => 'Despachado',
        self::FACTURADO => 'Facturado',
        self::ANULADO => 'Anulado',
    ];

    /**
     * En qué estado queda cada rollo según el estado del pedido. El rollo no
     * se mueve a mano: sigue al documento que lo tiene comprometido.
     */
    public const ESTADO_ROLLO = [
        self::BORRADOR => Rollo::DISPONIBLE,
        // Al solicitarlo los rollos ya quedan reservados, aunque nadie los haya
        // bajado del rack todavía: si no, otro vendedor podría venderlos
        // mientras el pedido espera su turno en la bandeja.
        self::SOLICITADO => Rollo::SEPARADO,
        self::PREPARANDO => Rollo::EN_PREPARACION,
        // Apartados pero todavía dentro del almacén: siguen en preparación
        // hasta que salgan físicamente.
        self::SEPARADO => Rollo::EN_PREPARACION,
        self::DESPACHADO => Rollo::DESPACHADO,
        self::FACTURADO => Rollo::VENDIDO,
        self::ANULADO => Rollo::DISPONIBLE,
    ];

    /** A qué estados puede pasar el pedido desde el actual. */
    public const TRANSICIONES = [
        self::BORRADOR => [self::SOLICITADO, self::ANULADO],
        self::SOLICITADO => [self::PREPARANDO, self::BORRADOR, self::ANULADO],
        self::PREPARANDO => [self::SEPARADO, self::SOLICITADO, self::ANULADO],
        self::SEPARADO => [self::DESPACHADO, self::PREPARANDO, self::ANULADO],
        self::DESPACHADO => [self::FACTURADO, self::ANULADO],
        self::FACTURADO => [],
        self::ANULADO => [],
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

    /** Lo que pidió el cliente: producto y cantidad, sin fijar rollos. */
    public function detalles()
    {
        return $this->hasMany(OrdenVentaDetalle::class);
    }

    /** Los rollos que el almacén fue asignando a esas líneas. */
    public function rollosAsignados()
    {
        return $this->hasManyThrough(
            OrdenVentaRollo::class,
            OrdenVentaDetalle::class,
            'orden_venta_id',
            'orden_venta_detalle_id',
        );
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

    /** Mientras es borrador se le pueden agregar y quitar líneas. */
    public function esEditable(): bool
    {
        return $this->estado === self::BORRADOR;
    }

    /**
     * ¿Está cubierto todo lo que pidió el cliente?
     *
     * Ya no se cuentan rollos escaneados contra una lista fija: cada línea
     * pide unos metros y el almacenero los va cubriendo con los rollos que
     * encuentra. El pedido está listo cuando ninguna línea queda corta.
     */
    public function estaVerificada(): bool
    {
        $lineas = $this->relationLoaded('detalles') ? $this->detalles : $this->detalles()->with('rollos')->get();

        return $lineas->isNotEmpty() && $lineas->every(fn ($d) => $d->estaCubierta());
    }

    /** Metros pedidos y metros ya cubiertos, para las pantallas. */
    public function avance(): array
    {
        $lineas = $this->relationLoaded('detalles') ? $this->detalles : $this->detalles()->with('rollos')->get();

        return [
            'pedidos' => round((float) $lineas->sum('metros'), 2),
            'asignados' => round($lineas->sum(fn ($d) => $d->metrosAsignados()), 2),
        ];
    }
}
