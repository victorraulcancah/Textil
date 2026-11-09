<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Metros que se pasaron de un rollo al stock por metros. No se edita: queda como constancia de quién convirtió qué.
 */
class ConversionMetros extends Model
{
    protected $table = 'conversiones_metros';

    protected $fillable = [
        'rollo_id',
        'producto_id',
        'producto_color_id',
        'almacen_id',
        'metros',
        'metros_rollo_antes',
        'metros_rollo_despues',
        'usuario_id',
        'observaciones',
    ];

    protected function casts(): array
    {
        return [
            'metros' => 'decimal:2',
            'metros_rollo_antes' => 'decimal:2',
            'metros_rollo_despues' => 'decimal:2',
        ];
    }

    public function rollo()
    {
        return $this->belongsTo(Rollo::class);
    }

    public function producto()
    {
        return $this->belongsTo(Producto::class);
    }

    public function color()
    {
        return $this->belongsTo(ProductoColor::class, 'producto_color_id');
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }
}
