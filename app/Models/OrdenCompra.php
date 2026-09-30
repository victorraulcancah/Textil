<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class OrdenCompra extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Orden de compra';
    protected $table = 'ordenes_compra';

    protected $fillable = [
        'codigo',
        // Cuántas órdenes lleva ese proveedor: es el número del documento (HAN-002-26).
        'numero_proveedor',
        'tipo',
        'proveedor_id',
        'solicitud_id',
        'fecha_emision',
        'fecha_entrega_estimada',
        'estado',
        'usuario_crea_id',
        'usuario_aprueba_id',
        'fecha_aprobacion',
        'usuario_envia_id',
        'fecha_envio',
        'observaciones',
        'condicion_pago',
        'moneda',
        'tipo_cambio',
        // Solo se llenan cuando tipo = exterior: es una compra de importación.
        'cargo_type',
        'medio_transporte',
        'incoterm',
        'pais_origen',
        'pais_destino',
        'puerto_embarque',
        'puerto_destino',
        'numero_contenedor',
        'fecha_embarque_estimada',
        'elaborado_por',
        'aprobado_por',
        // El usuario elegido como aprobador: el único que puede aprobarla.
        'aprobador_id',
    ];

    protected function casts(): array
    {
        return [
            'fecha_emision' => 'datetime',
            'fecha_entrega_estimada' => 'datetime',
            'fecha_embarque_estimada' => 'date',
            'fecha_aprobacion' => 'datetime',
            'fecha_envio' => 'datetime',
            'tipo_cambio' => 'decimal:4',
        ];
    }

    public function proveedor()
    {
        return $this->belongsTo(Proveedor::class);
    }

    /**
     * El número con el que sale en el documento: código corto del proveedor +
     * número de la orden + año de emisión (HAN-002-26). Sin código corto, el
     * código de la orden tal cual (OCN-002).
     */
    public function codigoDocumento(): string
    {
        $corto = $this->proveedor?->codigo_corto;

        if (! $corto || ! $this->numero_proveedor) {
            return (string) $this->codigo;
        }

        return sprintf('%s-%03d-%s', $corto, $this->numero_proveedor, $this->fecha_emision?->format('y') ?? date('y'));
    }

    /**
     * Siguiente número de las órdenes de este proveedor (1, 2, 3…). No se
     * reutiliza el de una orden borrada: el contador solo avanza.
     */
    public static function siguienteNumeroProveedor(int $proveedorId): int
    {
        $serie = SerieDocumento::where('tipo_documento', 'orden_compra_proveedor')
            ->where('serie', 'PROV'.$proveedorId)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'orden_compra_proveedor', 'serie' => 'PROV'.$proveedorId],
                ['numero_actual' => 0, 'activo' => true],
            );
        $serie->increment('numero_actual');

        return (int) $serie->numero_actual;
    }

    /** ¿Es una compra de importación? Solo ahí aplican los campos de embarque. */
    public function esExterior(): bool
    {
        return $this->tipo === 'exterior';
    }

    public function solicitud()
    {
        return $this->belongsTo(SolicitudCompra::class);
    }

    public function usuarioCrea()
    {
        return $this->belongsTo(User::class, 'usuario_crea_id');
    }

    /** El usuario designado para aprobar la orden (puede no haberse elegido). */
    public function aprobador()
    {
        return $this->belongsTo(User::class, 'aprobador_id');
    }

    public function usuarioAprueba()
    {
        return $this->belongsTo(User::class, 'usuario_aprueba_id');
    }

    public function usuarioEnvia()
    {
        return $this->belongsTo(User::class, 'usuario_envia_id');
    }

    public function detalles()
    {
        return $this->hasMany(OrdenCompraDetalle::class);
    }

    public function recepciones()
    {
        return $this->hasMany(RecepcionCompra::class);
    }

    /** Compras generadas a partir de esta orden. */
    public function compras()
    {
        return $this->hasMany(Compra::class);
    }
}
