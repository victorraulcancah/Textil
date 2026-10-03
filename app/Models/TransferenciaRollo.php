<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Un rollo que el almacén pedido apartó para una línea del requerimiento (igual que `orden_venta_rollos`).
 */
class TransferenciaRollo extends Model
{
    protected $table = 'transferencia_rollos';

    protected $fillable = [
        'transferencia_detalle_id',
        'rollo_id',
        // El rollo que de verdad llega: el mismo si salió entero; si fue un corte, la parte nueva (-B).
        'rollo_viaja_id',
        'metros',
        'metros_rollo',
        'entero',
        'escaneado_at',
        'usuario_escanea_id',
        // Recepción en el destino: cuándo se escaneó el rollo que llegó, y quién.
        'recibido_at',
        'usuario_recibe_id',
    ];

    protected function casts(): array
    {
        return [
            'metros' => 'decimal:2',
            'metros_rollo' => 'decimal:2',
            'entero' => 'boolean',
            'escaneado_at' => 'datetime',
            'recibido_at' => 'datetime',
        ];
    }

    public function detalle()
    {
        return $this->belongsTo(TransferenciaDetalle::class, 'transferencia_detalle_id');
    }

    public function rollo()
    {
        return $this->belongsTo(Rollo::class);
    }

    /** El rollo que viaja (el de origen si salió entero, la parte nueva si fue un corte). */
    public function viaja()
    {
        return $this->belongsTo(Rollo::class, 'rollo_viaja_id');
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'usuario_escanea_id');
    }
}
