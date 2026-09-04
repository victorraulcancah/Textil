<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Transferencia extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Transferencia';
    protected $table = 'transferencias';

    /** Serie del correlativo de la guía de traslado. */
    public const SERIE = 'T001';

    protected $fillable = [
        'serie',
        'numero',
        'almacen_origen_id',
        'almacen_destino_id',
        'motivo_traslado',
        'fecha_inicio_traslado',
        'modalidad_transporte',
        'transportista_razon_social',
        'transportista_ruc',
        'vehiculo_placa',
        'conductor_nombre',
        'conductor_documento',
        'conductor_licencia',
        'numero_bultos',
        'peso_bruto_kg',
        'estado',
        'fecha_envio',
        'fecha_recepcion',
        'usuario_envio_id',
        'usuario_recepcion_id',
        'observaciones',
    ];

    protected $appends = ['documento'];

    protected function casts(): array
    {
        return [
            'fecha_envio' => 'datetime',
            'fecha_recepcion' => 'datetime',
            'fecha_inicio_traslado' => 'date',
            'peso_bruto_kg' => 'decimal:3',
        ];
    }

    /** Número formal de la guía, ej. "T001-00000012". */
    public function getDocumentoAttribute(): ?string
    {
        return $this->serie && $this->numero ? "{$this->serie}-{$this->numero}" : null;
    }

    /** Motivo del catálogo administrable (referenciado por código). */
    public function motivo()
    {
        return $this->belongsTo(MotivoTraslado::class, 'motivo_traslado', 'codigo');
    }

    public function almacenOrigen()
    {
        return $this->belongsTo(Almacen::class, 'almacen_origen_id');
    }

    public function almacenDestino()
    {
        return $this->belongsTo(Almacen::class, 'almacen_destino_id');
    }

    public function usuarioEnvio()
    {
        return $this->belongsTo(User::class, 'usuario_envio_id');
    }

    public function usuarioRecepcion()
    {
        return $this->belongsTo(User::class, 'usuario_recepcion_id');
    }

    public function detalles()
    {
        return $this->hasMany(TransferenciaDetalle::class);
    }
}
