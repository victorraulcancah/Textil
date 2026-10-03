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
        // Requerimiento: RQ + número del almacén pedido (RQ002-001 = se pide al almacén 2).
        'requerimiento_serie',
        'requerimiento_numero',
        'usuario_solicita_id',
        'fecha_solicitud',
        'fecha_separacion',
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
        'motivo_rechazo',
    ];

    protected $appends = ['documento', 'requerimiento'];

    protected function casts(): array
    {
        return [
            'fecha_envio' => 'datetime',
            'fecha_recepcion' => 'datetime',
            'fecha_solicitud' => 'datetime',
            'fecha_separacion' => 'datetime',
            'fecha_inicio_traslado' => 'date',
            'peso_bruto_kg' => 'decimal:3',
        ];
    }

    /** Número formal de la guía, ej. "T001-00000012". */
    public function getDocumentoAttribute(): ?string
    {
        return $this->serie && $this->numero ? "{$this->serie}-{$this->numero}" : null;
    }

    /** Número del requerimiento, ej. "RQ002-001" (null si es un traslado directo). */
    public function getRequerimientoAttribute(): ?string
    {
        return $this->requerimiento_serie && $this->requerimiento_numero
            ? "{$this->requerimiento_serie}-{$this->requerimiento_numero}"
            : null;
    }

    public function esRequerimiento(): bool
    {
        return $this->requerimiento_serie !== null;
    }

    /** Serie de los requerimientos que se piden a un almacén: RQ + su número de 3 cifras. */
    public static function serieRequerimiento(Almacen $almacen): string
    {
        return 'RQ'.str_pad((string) ($almacen->numero_serie ?: $almacen->id), 3, '0', STR_PAD_LEFT);
    }

    public function usuarioSolicita()
    {
        return $this->belongsTo(User::class, 'usuario_solicita_id');
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
