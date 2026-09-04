<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/** Un color del muestrario de una tela: "Azul Marino - Cód. 402". */
class ProductoColor extends Model
{
    protected $table = 'producto_colores';

    protected $appends = ['imagen_url'];

    protected $fillable = [
        'producto_id',
        'nombre',
        'codigo',
        'hex',
        'imagen',
        'activo',
    ];

    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }

    public function producto()
    {
        return $this->belongsTo(Producto::class);
    }

    /** URL pública de la foto del color, o null si no tiene. */
    public function getImagenUrlAttribute(): ?string
    {
        if (! $this->imagen || ! Storage::disk('public')->exists($this->imagen)) {
            return null;
        }

        return Storage::disk('public')->url($this->imagen);
    }
}
