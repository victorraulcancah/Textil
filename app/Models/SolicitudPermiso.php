<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Un pedido de acceso: lo hace un usuario y lo resuelve un administrador. */
class SolicitudPermiso extends Model
{
    protected $table = 'solicitudes_permiso';

    protected $fillable = [
        'user_id', 'permiso', 'motivo', 'estado', 'respuesta',
        'resuelta_por', 'resuelta_en', 'excepcion_id',
    ];

    protected function casts(): array
    {
        return ['resuelta_en' => 'datetime'];
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function resueltaPor()
    {
        return $this->belongsTo(User::class, 'resuelta_por');
    }
}
