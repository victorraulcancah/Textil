<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * Una dirección del cliente: la fiscal (una sola) o una de entrega. Una de
 * todas es la predeterminada: la que sale en la lista y en los documentos.
 */
class ClienteDireccion extends Model
{
    public const FISCAL = 'fiscal';
    public const ENTREGA = 'entrega';
    public const TIPOS = [self::FISCAL, self::ENTREGA];

    protected $table = 'cliente_direcciones';

    protected $fillable = [
        'cliente_id',
        'tipo',
        'predeterminada',
        'direccion',
        'referencia',
        'pais',
        'departamento',
        'provincia',
        'distrito',
        'ubigeo',
        'codigo_postal',
    ];

    protected function casts(): array
    {
        return [
            'predeterminada' => 'boolean',
        ];
    }

    public function cliente()
    {
        return $this->belongsTo(Cliente::class);
    }

    /** Sin país o Perú: el lugar sale del catálogo de ubigeos. */
    public function esDelPeru(): bool
    {
        return in_array(Str::upper(Str::ascii(trim((string) $this->pais))), ['', 'PERU'], true);
    }

    /** Lista para imprimir, como la muestra SUNAT: la calle y luego departamento - provincia - distrito. */
    public function completa(): string
    {
        $lugar = collect([$this->departamento, $this->provincia, $this->distrito])->filter()->implode(' - ');
        $texto = trim($this->direccion.' '.$lugar);

        return $this->esDelPeru() ? $texto : "{$texto} - {$this->pais}";
    }
}
