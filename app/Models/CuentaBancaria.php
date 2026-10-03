<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class CuentaBancaria extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Cuenta bancaria';
    protected $table = 'cuentas_bancarias';

    protected $fillable = [
        // Cada cuenta es de una sucursal (los bancos, en cambio, son un catálogo compartido).
        'almacen_id',
        'banco_id',
        'alias',
        'numero_cuenta',
        'cci',
        'titular',
        'moneda',
        'tipo_cuenta',
        'activo',
    ];

    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }

    public function banco()
    {
        return $this->belongsTo(Banco::class);
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function tarjetas()
    {
        return $this->hasMany(TarjetaBancaria::class);
    }
}
