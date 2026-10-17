<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** Lo que se le devolvió a un cliente de un anticipo, en uno o varios métodos. */
class AnticipoDevolucion extends Model
{
    use Auditable;

    protected string $auditarModulo = 'Devolución de anticipo';

    protected $table = 'anticipo_devoluciones';

    public const VIGENTE = 'vigente';

    public const ANULADA = 'anulada';

    protected $fillable = [
        'anticipo_id',
        'usuario_id',
        'fecha',
        'moneda',
        'monto',
        'observaciones',
        'estado',
        'anulada_por',
        'anulada_en',
        'motivo_anulacion',
    ];

    protected function casts(): array
    {
        return [
            'fecha' => 'date',
            'monto' => 'decimal:2',
            'anulada_en' => 'datetime',
        ];
    }

    public function anticipo()
    {
        return $this->belongsTo(Anticipo::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    public function pagos()
    {
        return $this->hasMany(AnticipoDevolucionPago::class, 'devolucion_id');
    }
}
