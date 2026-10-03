<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Caja extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Caja';
    protected $table = 'cajas';

    protected $fillable = [
        // Cada caja es de una sucursal; su código es CJ + número del almacén + correlativo (CJ002-001).
        'almacen_id',
        'codigo',
        'nombre',
        'acepta_efectivo',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'acepta_efectivo' => 'boolean',
            'activo' => 'boolean',
        ];
    }

    /** La serie de las cajas de un almacén: CJ001, CJ002… (cada sucursal numera las suyas). */
    public static function serieDeAlmacen(?int $almacenId): string
    {
        $numero = $almacenId ? Almacen::whereKey($almacenId)->value('numero_serie') : null;

        return 'CJ'.str_pad((string) ($numero ?: $almacenId ?: 1), 3, '0', STR_PAD_LEFT);
    }

    /** El código de la siguiente caja de ese almacén: CJ002-001, CJ002-002… */
    public static function siguienteCodigo(int $almacenId): string
    {
        $serie = self::serieDeAlmacen($almacenId);
        $doc = SerieDocumento::where('tipo_documento', 'caja')
            ->where('serie', $serie)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'caja', 'serie' => $serie],
                ['numero_actual' => 0, 'activo' => true, 'almacen_id' => $almacenId],
            );
        $doc->increment('numero_actual');

        return $serie.'-'.str_pad((string) $doc->numero_actual, 3, '0', STR_PAD_LEFT);
    }

    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    public function cuentasBancarias()
    {
        return $this->belongsToMany(CuentaBancaria::class, 'caja_cuenta_bancaria', 'caja_id', 'cuenta_bancaria_id')->withTimestamps();
    }

    public function billeteras()
    {
        return $this->belongsToMany(BilleteraDigital::class, 'caja_billetera', 'caja_id', 'billetera_id')->withTimestamps();
    }

    public function aperturas()
    {
        return $this->hasMany(AperturaCaja::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'id', 'caja_id');
    }
}
