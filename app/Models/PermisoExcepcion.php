<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Un permiso que se le concede a una persona por encima de sus roles:
 * una vez, por un tiempo o de forma permanente.
 */
class PermisoExcepcion extends Model
{
    protected $table = 'permiso_excepciones';

    public const UNA_VEZ = 'una_vez';
    public const TEMPORAL = 'temporal';
    public const PERMANENTE = 'permanente';

    protected $fillable = [
        'user_id', 'permiso', 'alcance', 'expira_en', 'usada_en', 'motivo',
        'concedido_por', 'revocada_en', 'revocada_por',
    ];

    protected function casts(): array
    {
        return [
            'expira_en' => 'datetime',
            'usada_en' => 'datetime',
            'revocada_en' => 'datetime',
        ];
    }

    /** Las que hoy sirven: no revocadas, no vencidas y, si son de una vez, sin gastar. */
    public function scopeVigentes(Builder $query): Builder
    {
        return $query->whereNull('revocada_en')
            ->where(function (Builder $q) {
                $q->where('alcance', self::PERMANENTE)
                    ->orWhere(fn (Builder $t) => $t->where('alcance', self::TEMPORAL)->where('expira_en', '>', now()))
                    ->orWhere(fn (Builder $u) => $u->where('alcance', self::UNA_VEZ)->whereNull('usada_en'));
            });
    }

    public function estado(): string
    {
        if ($this->revocada_en) {
            return 'revocada';
        }
        if ($this->alcance === self::UNA_VEZ && $this->usada_en) {
            return 'usada';
        }
        if ($this->alcance === self::TEMPORAL && (! $this->expira_en || $this->expira_en->isPast())) {
            return 'vencida';
        }

        return 'vigente';
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function concedidoPor()
    {
        return $this->belongsTo(User::class, 'concedido_por');
    }
}
