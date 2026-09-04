<?php
namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Categoria extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Categoría';
    protected $table = 'categorias';

    protected $fillable = [
        'categoria_padre_id',
        'nombre',
        'nivel',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'nivel' => 'integer',
            'activo' => 'boolean',
        ];
    }

    public function padre() { return $this->belongsTo(Categoria::class, 'categoria_padre_id'); }
    public function hijos() { return $this->hasMany(Categoria::class, 'categoria_padre_id'); }
    public function productos() { return $this->hasMany(Producto::class); }
}
