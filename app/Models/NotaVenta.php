<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotaVenta extends Model
{
    protected $table = 'notas_venta';

    protected $fillable = [
        'serie',
        'numero',
        'cliente_id',
        'almacen_id',
        'vendedor_id',
        'fecha_emision',
        'moneda',
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
}
