<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class NotaVenta extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Proforma';

    /** La serie con la que se numeran las proformas nuevas: PF01-001, PF01-002… (las anteriores conservan NV01). */
    public const SERIE = 'PF01';

    protected $table = 'notas_venta';

    protected $fillable = [
        'serie',
        'numero',
        'cliente_id',
        'orden_venta_id',
        'almacen_id',
        'vendedor_id',
        'fecha_emision',
        'moneda',
        // SUNAT venta del día: lleva a soles una venta en dólares en los reportes.
        'tipo_cambio',
        'tipo_pago',
        'subtotal',
        'descuento_total',
        'total',
        'estado',
        'motivo_anulacion',
        'usuario_anula_id',
        'fecha_anulacion',
        'observaciones',
    ];

    protected function casts(): array
    {
        return [
            'fecha_emision' => 'date',
            'fecha_anulacion' => 'datetime',
            'subtotal' => 'decimal:2',
            'descuento_total' => 'decimal:2',
            'total' => 'decimal:2',
            'tipo_cambio' => 'decimal:4',
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

    public function usuarioAnula()
    {
        return $this->belongsTo(User::class, 'usuario_anula_id');
    }

    public function detalles()
    {
        return $this->hasMany(NotaVentaDetalle::class);
    }

    public function pagos()
    {
        return $this->hasMany(NotaVentaPago::class);
    }

    /** Pedido del que nació esta nota, si no fue venta de mostrador. */
    public function ordenVenta()
    {
        return $this->belongsTo(OrdenVenta::class);
    }
}
