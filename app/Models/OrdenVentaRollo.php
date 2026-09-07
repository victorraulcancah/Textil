<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Una línea del pedido: un rollo y los metros que se llevan de él.
 *
 * Si los metros son menos que el metraje del rollo se corta un pedazo y el
 * rollo sigue existiendo; si son todos, el rollo sale entero.
 */
class OrdenVentaRollo extends Model
{
    protected $table = 'orden_venta_rollos';

    protected $fillable = [
        'orden_venta_id',
        'rollo_id',
        'producto_presentacion_id',
        'metros',
        'precio_unitario',
        'descuento',
        'subtotal',
        'escaneado_at',
        'usuario_escanea_id',
    ];

    protected function casts(): array
    {
        return [
            'metros' => 'decimal:2',
            'precio_unitario' => 'decimal:2',
            'descuento' => 'decimal:2',
            'subtotal' => 'decimal:2',
            'escaneado_at' => 'datetime',
        ];
    }

    public function ordenVenta()
    {
        return $this->belongsTo(OrdenVenta::class);
    }

    public function rollo()
    {
        return $this->belongsTo(Rollo::class);
    }

    /** ¿Se lleva el rollo entero o solo un pedazo? */
    public function esParcial(): bool
    {
        return (float) $this->metros < (float) $this->rollo?->metros_actual;
    }

    public function presentacion()
    {
        return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id');
    }
}
