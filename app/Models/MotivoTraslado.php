<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/** Motivo de la guía de traslado. La guía lo referencia por `codigo`. */
class MotivoTraslado extends Model
{
    protected $table = 'motivos_traslado';

    protected $fillable = ['codigo', 'nombre', 'es_sistema', 'activo'];

    protected function casts(): array
    {
        return [
            'es_sistema' => 'boolean',
            'activo' => 'boolean',
        ];
    }

    /** Código estable a partir del nombre: "Traslado a feria" → traslado_a_feria. */
    public static function codigoDesde(string $nombre): string
    {
        return Str::of($nombre)->ascii()->lower()->replaceMatches('/[^a-z0-9]+/', '_')->trim('_')->limit(50, '');
    }
}
