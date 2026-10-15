<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class MovimientoCaja extends Model
{
    use Auditable;
    // Anular no borra: el movimiento sale de los totales y de los reportes, pero Mi Caja lo sigue mostrando.
    use SoftDeletes;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Movimiento de caja';
    protected $table = 'movimientos_caja';

    protected $fillable = [
        'apertura_caja_id',
        'tipo',
        'motivo_movimiento_id',
        'metodo_pago_id',
        'cuenta_bancaria_id',
        'tarjeta_id',
        'billetera_id',
        'numero_operacion',
        'captura_url',
        'monto',
        // En qué moneda es este movimiento; casi siempre soles, salvo el
        // pago de una deuda que quedó pactada en otra moneda.
        'moneda',
        'descripcion',
        'documento_referencia_tipo',
        'documento_referencia_id',
        'fecha',
        'anulado_motivo',
        'anulado_por',
        // Un ingreso enviado por otra caja al cerrar: se ve, pero no cuenta hasta que se apruebe el cierre.
        'por_aprobar',
    ];

    /** El nombre del filtro que deja fuera de los totales lo que aún no se aprobó. */
    public const FILTRO_APROBADOS = 'movimientos_aprobados';

    protected static function booted(): void
    {
        // Por defecto, todo lo que se consulta (totales, arqueos, reportes) deja fuera lo que está por aprobar. Las
        // listas que lo muestran lo piden con withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS).
        static::addGlobalScope(self::FILTRO_APROBADOS, fn ($q) => $q->where($q->getModel()->getTable().'.por_aprobar', false));
    }

    /**
     * Anula los movimientos de la consulta dejando constancia de por qué y quién. No cuentan más en la caja, pero
     * siguen visibles con su estado.
     */
    public static function anularDe($consulta, string $motivo): void
    {
        $consulta->update(['anulado_motivo' => $motivo, 'anulado_por' => auth()->id()]);
        $consulta->delete();
    }

    protected function casts(): array
    {
        return [
            'monto' => 'decimal:2',
            'fecha' => 'date',
            'por_aprobar' => 'boolean',
        ];
    }

    public function apertura()
    {
        return $this->belongsTo(AperturaCaja::class, 'apertura_caja_id');
    }

    public function motivo()
    {
        return $this->belongsTo(MotivoMovimiento::class, 'motivo_movimiento_id');
    }

    public function metodoPago()
    {
        return $this->belongsTo(MetodoPago::class, 'metodo_pago_id');
    }

    public function cuentaBancaria()
    {
        return $this->belongsTo(CuentaBancaria::class, 'cuenta_bancaria_id');
    }

    public function tarjeta()
    {
        return $this->belongsTo(TarjetaBancaria::class, 'tarjeta_id');
    }

    public function billetera()
    {
        return $this->belongsTo(BilleteraDigital::class, 'billetera_id');
    }
}
