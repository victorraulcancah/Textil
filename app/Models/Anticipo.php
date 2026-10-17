<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** Dinero que un cliente entrega antes de la venta, en soles o en dólares. */
class Anticipo extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Anticipo';

    public const VIGENTE = 'vigente';

    public const ANULADO = 'anulado';

    protected $fillable = [
        'serie',
        'numero',
        'almacen_id',
        'cliente_id',
        'usuario_id',
        'fecha',
        'moneda',
        'monto',
        'monto_aplicado',
        'forma_pago',
        'cuenta_bancaria_id',
        'billetera_id',
        'referencia',
        'movimiento_caja_id',
        'observaciones',
        'estado',
        'motivo_anulacion',
        'usuario_anula_id',
        'fecha_anulacion',
    ];

    protected $appends = ['documento', 'saldo'];

    protected function casts(): array
    {
        return [
            'fecha' => 'date',
            'monto' => 'decimal:2',
            'monto_aplicado' => 'decimal:2',
            'fecha_anulacion' => 'datetime',
        ];
    }

    /** "AN01" para el almacén 1: cada almacén lleva su propia serie. */
    public static function serieDeAlmacen(?int $almacenId): string
    {
        $numero = $almacenId ? Almacen::whereKey($almacenId)->value('numero_serie') : null;

        return 'AN'.str_pad((string) ($numero ?: 1), 2, '0', STR_PAD_LEFT);
    }

    public function getDocumentoAttribute(): string
    {
        return "{$this->serie}-{$this->numero}";
    }

    /** Lo que queda disponible para aplicar. */
    public function getSaldoAttribute(): string
    {
        if ($this->estado === self::ANULADO) {
            return '0.00';
        }

        return number_format(max(0, (float) $this->monto - (float) $this->monto_aplicado), 2, '.', '');
    }

    public function cliente()
    {
        return $this->belongsTo(Cliente::class);
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    public function cuentaBancaria()
    {
        return $this->belongsTo(CuentaBancaria::class, 'cuenta_bancaria_id');
    }

    public function billetera()
    {
        return $this->belongsTo(BilleteraDigital::class, 'billetera_id');
    }

    public function movimientoCaja()
    {
        return $this->belongsTo(MovimientoCaja::class, 'movimiento_caja_id')->withTrashed()->withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS);
    }
}
