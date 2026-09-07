<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Una línea del historial de un rollo.
 *
 * No se edita nunca: se escribe una vez y queda. Por eso no lleva auditoría
 * propia — el registro ya es la auditoría.
 */
class RolloMovimiento extends Model
{
    public const INGRESO = 'ingreso';
    public const SEPARACION = 'separacion';
    public const CANCELACION = 'cancelacion';
    public const PREPARACION = 'preparacion';
    public const DESPACHO = 'despacho';
    public const VENTA = 'venta';
    public const CORTE = 'corte';
    public const TRASLADO = 'traslado';
    public const AJUSTE = 'ajuste';

    public const TIPOS = [
        self::INGRESO => 'Ingreso',
        self::SEPARACION => 'Separación',
        self::CANCELACION => 'Cancelación',
        self::PREPARACION => 'Preparación',
        self::DESPACHO => 'Despacho',
        self::VENTA => 'Venta',
        self::CORTE => 'Corte',
        self::TRASLADO => 'Traslado',
        self::AJUSTE => 'Ajuste',
    ];

    protected $fillable = [
        'rollo_id',
        'tipo',
        'metros',
        'metros_antes',
        'metros_despues',
        'estado_antes',
        'estado_despues',
        'documento_tipo',
        'documento_id',
        'user_id',
        'observacion',
    ];

    protected function casts(): array
    {
        return [
            'metros' => 'decimal:2',
            'metros_antes' => 'decimal:2',
            'metros_despues' => 'decimal:2',
        ];
    }

    public function rollo()
    {
        return $this->belongsTo(Rollo::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
