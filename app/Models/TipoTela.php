<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Un tipo de tela dentro de una familia (ej: Trenza, dentro de Poliéster):
 * 2 dígitos (01), únicos dentro de su familia. El código completo de la tela es
 * "{familia}-{tipo}"; el color se agrega después.
 */
class TipoTela extends Model
{
    protected $table = 'tipos_tela';

    protected $fillable = ['familia_tela_id', 'codigo', 'nombre', 'activo'];

    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }

    /** Siguiente código de 2 dígitos libre, dentro de una familia. */
    public static function generarCodigo(int $familiaId): string
    {
        $ultimo = static::where('familia_tela_id', $familiaId)
            ->orderByRaw('LENGTH(codigo) DESC, codigo DESC')
            ->value('codigo');
        $n = (int) $ultimo;

        do {
            $n++;
            if ($n > 99) {
                throw new \DomainException('Esa familia ya usó los 99 tipos de tela que caben en el código.');
            }
            $codigo = str_pad((string) $n, 2, '0', STR_PAD_LEFT);
        } while (static::where('familia_tela_id', $familiaId)->where('codigo', $codigo)->exists());

        return $codigo;
    }

    /** El código completo de tela: "{familia}-{tipo}". */
    public function codigoCompleto(): string
    {
        return $this->familia->codigo.'-'.$this->codigo;
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
