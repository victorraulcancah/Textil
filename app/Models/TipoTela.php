<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Un tipo de tela dentro de una familia (ej: Trenza, dentro de Poliéster):
 * 3 dígitos, únicos dentro de su familia. El código completo de la tela es
 * "01-{familia}-{tipo}"; el color se agrega después.
 */
class TipoTela extends Model
{
    protected $table = 'tipos_tela';

    protected $fillable = ['familia_tela_id', 'codigo', 'nombre', 'activo'];

    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }

    /** Siguiente código de 3 dígitos libre, dentro de una familia. */
    public static function generarCodigo(int $familiaId): string
    {
        $ultimo = static::where('familia_tela_id', $familiaId)
            ->orderByRaw('LENGTH(codigo) DESC, codigo DESC')
            ->value('codigo');
        $n = (int) $ultimo;

        do {
            $n++;
            $codigo = str_pad((string) $n, 3, '0', STR_PAD_LEFT);
        } while (static::where('familia_tela_id', $familiaId)->where('codigo', $codigo)->exists());

        return $codigo;
    }

    /** El código completo de tela: "01-{familia}-{tipo}". */
    public function codigoCompleto(): string
    {
        return '01-'.$this->familia->codigo.'-'.$this->codigo;
    }

    public function familia()
    {
        return $this->belongsTo(FamiliaTela::class, 'familia_tela_id');
    }

    public function productos()
    {
        return $this->hasMany(Producto::class);
    }
}
