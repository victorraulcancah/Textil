<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Empresa extends Model
{
    protected $fillable = [
        'ruc',
        'razon_social',
        'nombre_comercial',
        'direccion',
        'departamento',
        'provincia',
        'distrito',
        'ciudad',
        'telefono',
        'email',
        'logo',
        'activa',
    ];

    protected function casts(): array
    {
        return [
            'activa' => 'boolean',
        ];
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }

    /**
     * Empresa activa que se usa como marca global (login, panel, favicon).
     */
    public static function activa(): ?self
    {
        return static::where('activa', true)->orderBy('id')->first();
    }

    /**
     * URL pública del logo. Si la empresa no tiene logo subido,
     * cae al logo BRAVA por defecto en /public/img/brava-horizontal.png.
     */
    public function getLogoUrlAttribute(): string
    {
        if ($this->logo && Storage::disk('public')->exists($this->logo)) {
            return Storage::disk('public')->url($this->logo);
        }

        return asset('img/brava-horizontal.png');
    }

    /**
     * URL para el favicon: usa el logo subido de la empresa si existe,
     * si no, el favicon.ico (monograma) del proyecto.
     */
    public function getFaviconUrlAttribute(): string
    {
        if ($this->logo && Storage::disk('public')->exists($this->logo)) {
            return Storage::disk('public')->url($this->logo);
        }

        return asset('favicon.ico');
    }
}
