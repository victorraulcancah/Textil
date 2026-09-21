<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Un rollo que el proveedor dice que va a enviar (una fila de su packing
 * list). Existe desde que se carga el Excel hasta que la recepción lo vuelve
 * un rollo de verdad; mientras tanto no es stock.
 */
class PackingListRollo extends Model
{
    public const PENDIENTE = 'pendiente';
    public const RECIBIDO = 'recibido';
    public const REGISTRADO = 'registrado';

    protected $table = 'packing_list_rollos';

    protected $fillable = [
        'compra_id',
        'compra_detalle_id',
        'producto_color_id',
        'codigo',
        'metros',
        'peso_kg',
        'envio',
        'estado',
        'usuario_carga_id',
        'usuario_escanea_id',
        'escaneado_at',
        'recepcion_id',
    ];

    protected function casts(): array
    {
        return [
            'metros' => 'decimal:2',
            'peso_kg' => 'decimal:3',
            'escaneado_at' => 'datetime',
        ];
    }

    public function compra()
    {
        return $this->belongsTo(Compra::class);
    }

    public function compraDetalle()
    {
        return $this->belongsTo(CompraDetalle::class);
    }

    public function color()
    {
        return $this->belongsTo(ProductoColor::class, 'producto_color_id');
    }

    public function usuarioEscanea()
    {
        return $this->belongsTo(User::class, 'usuario_escanea_id');
    }

    public function usuarioCarga()
    {
        return $this->belongsTo(User::class, 'usuario_carga_id');
    }
}
