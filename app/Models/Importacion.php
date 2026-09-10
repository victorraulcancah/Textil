<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/**
 * Un embarque: la llegada de mercadería del exterior de la que salieron unos
 * rollos concretos.
 *
 * Existe para poder ir hacia atrás: si un rollo sale con defecto de fábrica,
 * lo que importa es qué otros rollos vinieron en el mismo contenedor.
 */
class Importacion extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Importación';

    protected $table = 'importaciones';

    protected $fillable = [
        'codigo',
        'proveedor_id',
        'fecha_llegada',
        'documento',
        'observaciones',
    ];

    protected function casts(): array
    {
        return [
            'fecha_llegada' => 'date',
        ];
    }

    public function proveedor()
    {
        return $this->belongsTo(Proveedor::class);
    }

    public function rollos()
    {
        return $this->hasMany(Rollo::class);
    }

    /**
     * Busca el embarque por su código o lo abre si es la primera vez que se
     * nombra. La recepción de compra es donde se escribe ese código, y obligar
     * a darlo de alta antes en otra pantalla solo haría que nadie lo use.
     */
    public static function porCodigo(?string $codigo, ?int $proveedorId = null, ?string $fecha = null): ?self
    {
        $codigo = trim((string) $codigo);

        if ($codigo === '') {
            return null;
        }

        return static::firstOrCreate(
            ['codigo' => $codigo],
            ['proveedor_id' => $proveedorId, 'fecha_llegada' => $fecha],
        );
    }
}
