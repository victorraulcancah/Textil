<?php

namespace App\Services;

use App\Models\ConversionMetros;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Models\StockMetros;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * El stock por metros: tela suelta que se vende por corte sin escanear el QR de un rollo.
 *
 * Se lleva un saldo por tela, color y almacén. Se llena convirtiendo metros de un rollo (se pide su QR): el rollo baja
 * esos metros y el saldo suelto sube lo mismo, así el stock total del almacén no cambia, solo cambia de forma. Los
 * pedidos apartan de este saldo las líneas marcadas "sin QR" y lo descuentan al despachar.
 */
class StockMetrosService
{
    public function __construct(protected RolloService $rollos) {}

    /**
     * Pasa metros de un rollo (el del QR) al stock por metros. Con `$metros` null se convierte el rollo entero; el rollo
     * queda con lo que sobra, o agotado si no sobra nada.
     */
    public function convertir(string $codigo, ?float $metros = null, ?string $observaciones = null): ConversionMetros
    {
        return DB::transaction(function () use ($codigo, $metros, $observaciones) {
            $rollo = Rollo::where('codigo', trim($codigo))->lockForUpdate()->first();

            if (! $rollo) {
                throw new \DomainException("No existe ningún rollo con el código {$codigo}.");
            }

            if (! $rollo->estaDisponible()) {
                $estado = strtolower(Rollo::ESTADOS[$rollo->estado] ?? $rollo->estado);
                throw new \DomainException("El rollo {$rollo->codigo} está {$estado}: no se puede convertir.");
            }

            $antes = round((float) $rollo->metros_actual, 2);
            $metros = round($metros ?? $antes, 2);

            if ($metros <= 0) {
                throw new \DomainException('Indica cuántos metros pasan al stock por metros.');
            }
            if ($metros > $antes + 0.001) {
                throw new \DomainException("El rollo {$rollo->codigo} tiene {$antes} m: no se pueden convertir {$metros} m.");
            }
            $metros = min($metros, $antes);

            $conversion = ConversionMetros::create([
                'rollo_id' => $rollo->id,
                'producto_id' => $rollo->producto_id,
                'producto_color_id' => $rollo->producto_color_id,
                'almacen_id' => $rollo->almacen_id,
                'metros' => $metros,
                'metros_rollo_antes' => $antes,
                'metros_rollo_despues' => round($antes - $metros, 2),
                'usuario_id' => auth()->id(),
                'observaciones' => $observaciones ?: null,
            ]);

            $this->rollos->cortar(
                $rollo,
                $metros,
                RolloMovimiento::CONVERSION,
                'conversion_metros',
                $conversion->id,
                auth()->id(),
            );

            $this->fila($rollo->producto_id, $rollo->producto_color_id, $rollo->almacen_id)
                ->increment('metros', $metros);

            return $conversion->load('rollo:id,codigo', 'producto:id,codigo,nombre', 'color:id,nombre', 'almacen:id,nombre');
        });
    }

    /** Los saldos, con la tela, el color y el almacén. Solo los que tienen metros o apartado. */
    public function saldos(?int $almacenId = null, ?int $productoId = null)
    {
        return StockMetros::with('producto:id,codigo,nombre', 'color:id,nombre,codigo,hex', 'almacen:id,nombre')
            ->when($almacenId, fn ($q) => $q->where('almacen_id', $almacenId))
            ->when($productoId, fn ($q) => $q->where('producto_id', $productoId))
            ->where(fn ($q) => $q->where('metros', '>', 0)->orWhere('reservado', '>', 0))
            ->orderBy('producto_id')
            ->orderBy('producto_color_id')
            ->get();
    }

    /** El saldo de esa tela y color en un almacén (sin crearlo): lo que hay suelto y lo que se puede prometer. */
    public function disponible(int $productoId, ?int $colorId, int $almacenId): float
    {
        $fila = $this->consulta($productoId, $colorId, $almacenId)->first();

        return $fila ? $fila->disponible() : 0.0;
    }

    /**
     * El almacén del que sale un corte: el del pedido si ya lo tiene; si no, el que más metros sueltos libres tenga.
     * Falla si ninguno alcanza.
     */
    public function elegirAlmacen(int $productoId, ?int $colorId, float $metros, ?int $almacenId = null): int
    {
        $fila = $this->consulta($productoId, $colorId)
            ->when($almacenId, fn ($q) => $q->where('almacen_id', $almacenId))
            ->get()
            ->sortByDesc(fn (StockMetros $f) => $f->disponible())
            ->first();

        if (! $fila || $fila->disponible() + 0.001 < $metros) {
            $queda = $fila ? max(0, $fila->disponible()) : 0;

            throw new \DomainException(
                "No hay metros sueltos suficientes para vender {$metros} m sin QR: quedan {$queda} m en el stock por metros. "
                .'Convierte un rollo a metros o saca esa línea del corte.'
            );
        }

        return (int) $fila->almacen_id;
    }

    /** Aparta metros del saldo para un pedido solicitado. */
    public function reservar(int $productoId, ?int $colorId, int $almacenId, float $metros): void
    {
        DB::transaction(function () use ($productoId, $colorId, $almacenId, $metros) {
            $fila = $this->fila($productoId, $colorId, $almacenId, true);

            if ($fila->disponible() + 0.001 < $metros) {
                throw new \DomainException("Solo quedan {$fila->disponible()} m sueltos libres: no se pueden apartar {$metros} m.");
            }

            $fila->update(['reservado' => round((float) $fila->reservado + $metros, 2)]);
        });
    }

    /** Suelta lo apartado (el pedido se anula, se devuelve o baja la línea). Nunca deja el apartado en negativo. */
    public function liberar(int $productoId, ?int $colorId, int $almacenId, float $metros): void
    {
        DB::transaction(function () use ($productoId, $colorId, $almacenId, $metros) {
            $fila = $this->fila($productoId, $colorId, $almacenId, true);

            $fila->update(['reservado' => max(0, round((float) $fila->reservado - $metros, 2))]);
        });
    }

    /** La tela sale con el despacho: baja el saldo suelto. */
    public function consumir(int $productoId, ?int $colorId, int $almacenId, float $metros): void
    {
        DB::transaction(function () use ($productoId, $colorId, $almacenId, $metros) {
            $fila = $this->fila($productoId, $colorId, $almacenId, true);

            if ((float) $fila->metros + 0.001 < $metros) {
                throw new \DomainException(
                    "El stock por metros solo tiene {$fila->metros} m y el pedido necesita {$metros} m."
                );
            }

            $fila->update(['metros' => max(0, round((float) $fila->metros - $metros, 2))]);
        });
    }

    /** Se anula un pedido ya despachado: los metros vuelven al saldo suelto. */
    public function devolver(int $productoId, ?int $colorId, int $almacenId, float $metros): void
    {
        DB::transaction(function () use ($productoId, $colorId, $almacenId, $metros) {
            $this->fila($productoId, $colorId, $almacenId, true)->increment('metros', $metros);
        });
    }

    /** Lo último que se convirtió, para la pantalla. */
    public function historial(?int $almacenId = null, int $limite = 100)
    {
        return ConversionMetros::with('rollo:id,codigo', 'producto:id,codigo,nombre', 'color:id,nombre', 'almacen:id,nombre', 'usuario:id,name')
            ->when($almacenId, fn ($q) => $q->where('almacen_id', $almacenId))
            ->latest('id')
            ->limit($limite)
            ->get();
    }

    /** Sin crear nada: las filas de esa tela y color (de ese almacén, si se da). */
    private function consulta(int $productoId, ?int $colorId, ?int $almacenId = null): Builder
    {
        return StockMetros::query()
            ->where('producto_id', $productoId)
            ->when($colorId, fn ($q) => $q->where('producto_color_id', $colorId), fn ($q) => $q->whereNull('producto_color_id'))
            ->when($almacenId, fn ($q) => $q->where('almacen_id', $almacenId));
    }

    /** La fila del saldo, creada en cero si todavía no existe. Con `$bloquear`, dentro de la transacción en curso. */
    private function fila(int $productoId, ?int $colorId, int $almacenId, bool $bloquear = false): StockMetros
    {
        $consulta = $this->consulta($productoId, $colorId, $almacenId);

        return ($bloquear ? $consulta->lockForUpdate() : $consulta)->first()
            ?? StockMetros::create([
                'producto_id' => $productoId,
                'producto_color_id' => $colorId,
                'almacen_id' => $almacenId,
                'metros' => 0,
                'reservado' => 0,
            ]);
    }
}
