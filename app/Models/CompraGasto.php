<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Un gasto de la compra (seguro, aduana, transporte…) que se suma al costo de la mercadería. */
class CompraGasto extends Model
{
    protected $table = 'compra_gastos';

    protected $fillable = ['compra_id', 'concepto', 'monto_origen', 'moneda', 'monto', 'incluye_costo'];

    protected function casts(): array
    {
        return [
            'monto_origen' => 'decimal:2',
            'monto' => 'decimal:2',
            'incluye_costo' => 'boolean',
        ];
    }

    public function compra()
    {
        return $this->belongsTo(Compra::class);
    }
}
