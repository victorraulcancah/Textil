<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Prestamo extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Préstamo';
    protected $table = 'prestamos';

    /** Serie del correlativo del documento de préstamo. */
    public const SERIE = 'PR01';

    protected $fillable = [
        'serie',
        'numero',
        'almacen_id',
        'tipo',
        'tercero',
        'tercero_documento',
        'tercero_telefono',
        'fecha_prestamo',
        'fecha_devolucion_esperada',
        'fecha_devolucion',
        'estado',
        'usuario_id',
        'observaciones',
    ];

    protected $appends = ['documento'];

    protected function casts(): array
    {
        return [
            'fecha_prestamo' => 'datetime',
            'fecha_devolucion_esperada' => 'date',
            'fecha_devolucion' => 'datetime',
        ];
    }

    /** Número formal, ej. PR01-0007. */
    public function getDocumentoAttribute(): ?string
    {
        if (!$this->serie || !$this->numero) {
            return null;
        }

        return "{$this->serie}-{$this->numero}";
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    public function detalles()
    {
        return $this->hasMany(PrestamoDetalle::class);
    }

    public function devoluciones()
    {
        return $this->hasMany(PrestamoDevolucion::class);
    }
}
