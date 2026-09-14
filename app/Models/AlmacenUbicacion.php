<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Un nodo del árbol de ubicaciones de un almacén: piso, pasillo, rack, nivel
 * o posición. Cada uno es hijo de la ubicación de arriba (`padre_id`); los
 * pisos son la raíz, sin padre.
 *
 * No todos los almacenes llegan a los 5 niveles: uno chico puede quedarse en
 * pasillo. El árbol crece hasta donde a cada almacén le sirve.
 */
class AlmacenUbicacion extends Model
{
    protected $table = 'almacen_ubicaciones';

    protected $fillable = [
        'almacen_id',
        'padre_id',
        'tipo',
        'nombre',
        'orden',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'orden' => 'integer',
            'activo' => 'boolean',
        ];
    }

    /** El orden de la jerarquía: qué tipo sigue después de cuál. */
    public const NIVELES = ['piso', 'pasillo', 'rack', 'nivel', 'posicion'];

    /** Qué tipo le corresponde a un hijo de este nodo, o null si ya es el último nivel. */
    public function tipoHijo(): ?string
    {
        $i = array_search($this->tipo, self::NIVELES, true);

        return $i !== false ? (self::NIVELES[$i + 1] ?? null) : null;
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function padre()
    {
        return $this->belongsTo(self::class, 'padre_id');
    }

    public function hijos()
    {
        return $this->hasMany(self::class, 'padre_id')->orderBy('orden')->orderBy('nombre');
    }

    public function rollos()
    {
        return $this->hasMany(Rollo::class, 'almacen_ubicacion_id');
    }

    /** "Piso 1 / Pasillo A / Rack 2", subiendo por los padres. */
    public function rutaLegible(): string
    {
        $partes = [$this->nombre];
        $nodo = $this;

        while ($nodo->padre) {
            $nodo = $nodo->padre;
            array_unshift($partes, $nodo->nombre);
        }

        return implode(' / ', $partes);
    }
}
