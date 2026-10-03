<?php

namespace App\Services;

use App\Models\Almacen;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Models\Transferencia;
use App\Models\TransferenciaRollo;
use Illuminate\Support\Facades\DB;

/**
 * Recepción de un traslado en el almacén destino, de dos maneras:
 *
 *  - "Recibir todo" (`TransferenciaController::recibir`): se acepta lo enviado de golpe.
 *  - "Recepcionar": se escanea el QR de cada rollo que llegó (misma idea que recepcionar una compra). Solo entra al
 *    stock lo escaneado; si falta algo se confirma con diferencias y una observación.
 *
 * Mientras viajan, los rollos están "en tránsito": no se pueden vender ni separar. Quedan disponibles en el destino
 * cuando se reciben.
 */
class RecepcionTrasladoService
{
    public function __construct(
        private readonly RolloService $rollos,
        private readonly StockService $stock,
    ) {
    }

    /** Lo que muestra la pantalla de recepción: cada línea con los rollos que viajaron y cuáles ya se escanearon. */
    public function datos(Transferencia $t): array
    {
        $t->load([
            'almacenOrigen:id,nombre', 'almacenDestino:id,nombre',
            'detalles.presentacion.producto', 'detalles.color',
            'detalles.rollos.viaja',
        ]);

        $lineas = $t->detalles->map(function ($d) {
            $rollos = $d->rollos->filter(fn ($r) => $r->rollo_viaja_id)->values();

            return [
                'id' => $d->id,
                'producto' => $d->presentacion?->producto?->nombre,
                'color' => $d->color?->nombre,
                'presentacion' => $d->presentacion?->nombre,
                'enviado' => (float) $d->cantidad_enviada,
                'con_rollos' => $rollos->isNotEmpty(),
                'rollos' => $rollos->map(fn ($r) => [
                    'rollo_id' => $r->rollo_viaja_id,
                    'codigo' => $r->viaja?->codigo,
                    'metros' => (float) $r->metros,
                    'recibido' => $r->recibido_at !== null,
                ])->all(),
            ];
        })->all();

        $todos = collect($lineas)->flatMap(fn ($l) => $l['rollos']);

        return [
            'id' => $t->id,
            'documento' => $t->documento,
            'requerimiento' => $t->requerimiento,
            'estado' => $t->estado,
            'origen' => $t->almacenOrigen?->nombre,
            'destino' => $t->almacenDestino?->nombre,
            'lineas' => $lineas,
            'rollos_total' => $todos->count(),
            'rollos_recibidos' => $todos->where('recibido', true)->count(),
            // Una guía antigua o una de puro "por cantidad" no tiene rollos que escanear: se recibe todo.
            'con_rollos' => $todos->isNotEmpty(),
        ];
    }

    /** El almacenero del destino escanea un rollo que llegó. */
    public function escanear(Transferencia $t, string $codigo): array
    {
        $this->exigirEnTransito($t);

        $codigo = trim($codigo);
        $fila = TransferenciaRollo::whereIn('transferencia_detalle_id', $t->detalles()->pluck('id'))
            ->whereNotNull('rollo_viaja_id')
            ->whereHas('viaja', fn ($q) => $q->where('codigo', $codigo))
            ->with('viaja:id,codigo,metros_actual', 'detalle.presentacion.producto')
            ->first();

        if (! $fila) {
            $existe = Rollo::where('codigo', $codigo)->exists();
            throw new \DomainException(
                $existe
                    ? "El rollo {$codigo} no viene en este traslado."
                    : "No existe ningún rollo con el código {$codigo}."
            );
        }

        if ($fila->recibido_at) {
            throw new \DomainException("El rollo {$codigo} ya se recibió.");
        }

        $fila->update(['recibido_at' => now(), 'usuario_recibe_id' => auth()->id()]);

        $datos = $this->datos($t->fresh());

        return [
            'rollo' => ['id' => $fila->rollo_viaja_id, 'codigo' => $codigo],
            'metros' => (float) $fila->metros,
            'producto' => $fila->detalle?->presentacion?->producto?->nombre,
            'recibidos' => $datos['rollos_recibidos'],
            'total' => $datos['rollos_total'],
            'completo' => $datos['rollos_recibidos'] >= $datos['rollos_total'],
        ];
    }

    /** Deshace el escaneo de un rollo (se escaneó por error). */
    public function quitar(Transferencia $t, int $rolloId): array
    {
        $this->exigirEnTransito($t);

        TransferenciaRollo::whereIn('transferencia_detalle_id', $t->detalles()->pluck('id'))
            ->where('rollo_viaja_id', $rolloId)
            ->update(['recibido_at' => null, 'usuario_recibe_id' => null]);

        return $this->datos($t->fresh());
    }

    /**
     * Cierra la recepción con lo escaneado. Si faltan rollos hace falta una observación; solo lo escaneado entra al
     * stock del destino y lo que no llegó queda en tránsito, a la vista.
     */
    public function confirmar(Transferencia $t, ?string $observacion = null): Transferencia
    {
        $this->exigirEnTransito($t);

        $datos = $this->datos($t);
        if (! $datos['con_rollos']) {
            throw new \DomainException('Este traslado no tiene rollos que escanear: usa "Recibir todo".');
        }
        if ($datos['rollos_recibidos'] === 0) {
            throw new \DomainException('Escanea al menos un rollo para recepcionar.');
        }

        $faltan = $datos['rollos_total'] - $datos['rollos_recibidos'];
        if ($faltan > 0 && ! filled($observacion)) {
            throw new \DomainException("Faltan {$faltan} rollo(s) por escanear: escribe una observación para recepcionar con diferencias.");
        }

        return DB::transaction(function () use ($t, $observacion, $faltan) {
            $t->load('detalles.presentacion', 'detalles.rollos.viaja');
            $destino = Almacen::findOrFail($t->almacen_destino_id);

            foreach ($t->detalles as $d) {
                if (! $d->presentacion) {
                    continue;
                }

                $conRollos = $d->rollos->contains(fn ($r) => $r->rollo_viaja_id);
                $recibida = $conRollos
                    ? $d->presentacion->desdeMetros((float) $d->rollos->filter(fn ($r) => $r->rollo_viaja_id && $r->recibido_at)->sum('metros'))
                    : (float) $d->cantidad_enviada;

                $d->update(['cantidad_recibida' => $recibida]);

                if ($recibida > 0) {
                    $this->stock->entrada(
                        $d->presentacion, $destino, $recibida, 0,
                        'transferencia', 'transferencia', $t->id, auth()->id(),
                        colorId: $d->producto_color_id,
                    );
                }
            }

            // Los rollos escaneados quedan disponibles en el destino; los que faltan siguen en tránsito.
            $this->liberar($t, soloEscaneados: true);

            $t->update([
                'estado' => 'recibida',
                'fecha_recepcion' => now(),
                'usuario_recepcion_id' => auth()->id(),
                'observacion_recepcion' => $faltan > 0 ? trim((string) $observacion) : ($observacion ?: null),
            ]);

            return $t->fresh();
        });
    }

    /**
     * Deja disponibles en el destino los rollos que viajaron: todos ("Recibir todo") o solo los escaneados.
     */
    public function liberar(Transferencia $t, bool $soloEscaneados = false): void
    {
        $filas = TransferenciaRollo::whereIn('transferencia_detalle_id', $t->detalles()->pluck('id'))
            ->whereNotNull('rollo_viaja_id')
            ->when($soloEscaneados, fn ($q) => $q->whereNotNull('recibido_at'))
            ->with('viaja')
            ->get();

        foreach ($filas as $fila) {
            if (! $fila->recibido_at) {
                $fila->update(['recibido_at' => now(), 'usuario_recibe_id' => auth()->id()]);
            }
            if ($fila->viaja && $fila->viaja->estado === Rollo::EN_TRANSITO) {
                $this->rollos->cambiarEstado($fila->viaja, Rollo::DISPONIBLE, RolloMovimiento::TRASLADO, 'transferencia', $t->id);
            }
        }
    }

    private function exigirEnTransito(Transferencia $t): void
    {
        if ($t->estado !== 'en_transito') {
            throw new \DomainException('Solo se pueden recepcionar traslados en tránsito.');
        }
    }
}
