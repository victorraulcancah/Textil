<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Almacen extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Almacén';
    protected $table = 'almacenes';

    protected $fillable = [
        'nombre',
        'codigo',
        'direccion',
        'tipo',
        'activo',
        'predeterminado',
    ];

    /**
     * Unidades en las que este local vende (Metro, Rollo, Yarda…). Sin
     * ninguna marcada, vende en todas: es el comportamiento por defecto.
     */
    public function unidadesVenta()
    {
        return $this->belongsToMany(UnidadMedida::class, 'almacen_unidad_venta', 'almacen_id', 'unidad_medida_id');
    }

    /**
     * ¿Este local vende en esta unidad? Un almacén sin reglas vende en todas,
     * así que no hay que configurar nada para que siga funcionando como antes.
     */
    public function vendeEn(?int $unidadMedidaId): bool
    {
        $permitidas = $this->relationLoaded('unidadesVenta')
            ? $this->unidadesVenta
            : $this->unidadesVenta()->get();

        if ($permitidas->isEmpty()) {
            return true;
        }

        return $permitidas->contains('id', $unidadMedidaId);
    }

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
            'predeterminado' => 'boolean',
        ];
    }

    public function stocks()
    {
        return $this->hasMany(ProductoAlmacenStock::class);
    }

    public function movimientos()
    {
        return $this->hasMany(MovimientoInventario::class);
    }

    public function transferenciasOrigen()
    {
        return $this->hasMany(Transferencia::class, 'almacen_origen_id');
    }

    public function transferenciasDestino()
    {
        return $this->hasMany(Transferencia::class, 'almacen_destino_id');
    }

    public function ajustes()
    {
        return $this->hasMany(AjusteInventario::class);
    }

    public function tomas()
    {
        return $this->hasMany(TomaInventario::class);
    }
}
