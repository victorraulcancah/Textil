<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AjusteDetalle extends Model
{
    protected $table = 'ajuste_detalles';

    protected $fillable = [
        'ajuste_id',
        'producto_presentacion_id',
        // Telas: el color, el rollo del que salieron los metros (salida) o
        // cuántos rollos se crearon (entrada).
        'producto_color_id',
        'rollo_id',
        'rollos',
        'cantidad',
        'costo_unitario',
        'subtotal',
        'cantidad_sistema',
        'cantidad_fisica',
        'diferencia',
    ];

    protected function casts(): array
    {
        return [
            'costo_unitario' => 'decimal:4',
            'subtotal' => 'decimal:2',
            'cantidad_sistema' => 'decimal:2',
            'cantidad_fisica' => 'decimal:2',
            'diferencia' => 'decimal:2',
        ];
    }

    public function ajuste() { return $this->belongsTo(AjusteInventario::class, 'ajuste_id'); }
    public function presentacion() { return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id'); }
    public function color() { return $this->belongsTo(ProductoColor::class, 'producto_color_id'); }
    public function rollo() { return $this->belongsTo(Rollo::class); }
    /** Los rollos que nacieron de esta línea (entrada de tela). */
    public function rollosCreados() { return $this->hasMany(Rollo::class, 'ajuste_detalle_id'); }
}
