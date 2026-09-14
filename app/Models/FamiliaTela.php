<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Familia de tela (poliéster, algodón...): 2 dígitos, agrupa a los tipos. */
class FamiliaTela extends Model
{
    protected $table = 'familias_tela';

    protected $fillable = ['codigo', 'nombre', 'activo'];

    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }

    /** Siguiente código de 2 dígitos libre. */
    public static function generarCodigo(): string
    {
        $ultimo = static::orderByRaw('LENGTH(codigo) DESC, codigo DESC')->value('codigo');
        $n = (int) $ultimo;

        do {
            $n++;
            $codigo = str_pad((string) $n, 2, '0', STR_PAD_LEFT);
        } while (static::where('codigo', $codigo)->exists());

        return $codigo;
    }

    public function tipos()
    {
        return $this->hasMany(TipoTela::class);
    }
}
