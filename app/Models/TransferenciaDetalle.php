<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TransferenciaDetalle extends Model
{
    protected $table = 'transferencia_detalles';

    protected $fillable = [
        'transferencia_id',
        'producto_presentacion_id',
        // El color que viaja; opcional porque hay productos que no se
        // manejan por color (mercería, insumos).
        'producto_color_id',
        // Requerimiento: "rollos" (N rollos, opcional metros_por_rollo), "metros" o "cantidad" (lo que no es tela).
        'modo',
        'rollos_pedidos',
        'metros_por_rollo',
        'metros_pedidos',
        'cantidad_enviada',
        'cantidad_recibida',
    ];

    protected function casts(): array
    {
        return [
            'cantidad_enviada' => 'decimal:2',
            'cantidad_recibida' => 'decimal:2',
            'metros_por_rollo' => 'decimal:2',
            'metros_pedidos' => 'decimal:2',
            'rollos_pedidos' => 'integer',
        ];
    }

    public function transferencia() { return $this->belongsTo(Transferencia::class); }
    public function presentacion() { return $this->belongsTo(ProductoPresentacion::class, 'producto_presentacion_id'); }
    public function color() { return $this->belongsTo(ProductoColor::class, 'producto_color_id'); }

    /** Los rollos que el almacén pedido asignó a esta línea al escanearlos. */
    public function rollos() { return $this->hasMany(TransferenciaRollo::class, 'transferencia_detalle_id'); }

    public function esPorRollos(): bool { return $this->modo === 'rollos'; }

    public function esPorMetros(): bool { return $this->modo === 'metros'; }

    /** Es tela escaneable (rollos o metros). */
    public function esTela(): bool { return in_array($this->modo, ['rollos', 'metros'], true); }

    public function metrosAsignados(): float
    {
        $lista = $this->relationLoaded('rollos') ? $this->rollos : $this->rollos()->get();

        return round((float) $lista->sum('metros'), 2);
    }

    public function rollosPendientes(): int
    {
        $lista = $this->relationLoaded('rollos') ? $this->rollos : $this->rollos()->get();

        return max(0, (int) $this->rollos_pedidos - $lista->count());
    }

    public function metrosPendientes(): float
    {
        return $this->esPorMetros() ? max(0, round((float) $this->metros_pedidos - $this->metrosAsignados(), 2)) : 0.0;
    }

    /** ¿Lo pedido ya está cubierto con rollos escaneados? (lo que no es tela no se escanea). */
    public function estaCubierta(): bool
    {
        if ($this->esPorRollos()) {
            return $this->rollosPendientes() === 0;
        }
        if ($this->esPorMetros()) {
            return $this->metrosAsignados() + 0.01 >= (float) $this->metros_pedidos;
        }

        return true;
    }
}
