<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Un rollo que el almacén asignó a una línea del pedido.
 *
 * Se crea cuando el almacenero lo escanea: hasta ese momento el pedido solo
 * dice "150 metros de Polinán negro" y nadie sabe con qué piezas se cubrirán.
 *
 * `metros` es cuánto se toma de ese rollo para esta línea, que puede ser menos
 * de lo que mide: si faltan 20 m y el rollo tiene 58, se cortan 20 y el resto
 * vuelve al stock.
 */
class OrdenVentaRollo extends Model
{
    protected $table = 'orden_venta_rollos';

    protected $fillable = [
        'orden_venta_detalle_id',
        'rollo_id',
        'metros',
        'escaneado_at',
        'usuario_escanea_id',
    ];

    protected function casts(): array
    {
        return [
            'metros' => 'decimal:2',
            'escaneado_at' => 'datetime',
        ];
    }

    public function detalle()
    {
        return $this->belongsTo(OrdenVentaDetalle::class, 'orden_venta_detalle_id');
    }

    public function rollo()
    {
        return $this->belongsTo(Rollo::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'usuario_escanea_id');
    }

    /** ¿Se corta el rollo o se lleva entero? */
    public function esParcial(): bool
    {
        return (float) $this->metros < (float) ($this->rollo?->metros_actual ?? 0);
    }
}
