<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class BilleteraDigital extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Billetera digital';
    protected $table = 'billeteras_digitales';

    protected $fillable = [
        'almacen_id',
        'nombre',
        'numero_asociado',
        'cuenta_bancaria_id',
        'titular',
        'qr',
        'requiere_captura',
        'requiere_numero_operacion',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'requiere_captura' => 'boolean',
            'requiere_numero_operacion' => 'boolean',
            'activo' => 'boolean',
        ];
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function cuentaBancaria()
    {
        return $this->belongsTo(CuentaBancaria::class, 'cuenta_bancaria_id');
    }
}
