<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * El catálogo de colores compartido: se crea una sola vez y todas las
 * telas lo referencian. Antes cada producto escribía su propio color
 * suelto, y "Camello" podía terminar con un código distinto en cada tela.
 */
class Color extends Model
{
    protected $table = 'colores';

    protected $fillable = ['codigo', 'nombre', 'hex', 'activo'];

    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }

    /**
     * Siguiente código de 4 dígitos libre. Nunca se reutilizan códigos ya
     * usados, aunque el color se haya borrado —así lo pide el catálogo
     * original del cliente—, así que se busca el mayor y se avanza.
     */
    public static function generarCodigo(): string
    {
        $ultimo = static::orderByRaw('LENGTH(codigo) DESC, codigo DESC')->value('codigo');
        $n = (int) $ultimo;

        do {
            $n++;
            $codigo = str_pad((string) $n, 4, '0', STR_PAD_LEFT);
        } while (static::where('codigo', $codigo)->exists());

        return $codigo;
    }

    public function productoColores()
    {
        return $this->hasMany(ProductoColor::class);
    }
}
