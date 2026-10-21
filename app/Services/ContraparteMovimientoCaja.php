<?php

namespace App\Services;

use App\Models\Anticipo;
use App\Models\AnticipoDevolucion;
use App\Models\Compra;
use App\Models\CuentaPorCobrar;
use App\Models\CuentaPorPagar;
use App\Models\LetraCambio;
use App\Models\MovimientoCaja;
use App\Models\NotaVenta;
use Illuminate\Support\Collection;

/**
 * Con quién fue cada movimiento de caja y a qué documento corresponde: el cliente de una venta, un cobro, una letra o
 * un anticipo, o el proveedor de una compra o de un pago de cuenta por pagar, y el número de ese documento. Los
 * movimientos hechos a mano o internos (cierres de caja) no tienen contraparte ni documento y quedan en blanco.
 *
 * Carga los datos por tipo de documento, con una consulta por tipo (no una por movimiento).
 */
class ContraparteMovimientoCaja
{
    /**
     * Deja `contraparte` (nombre), `contraparte_tipo` ('Cliente' | 'Proveedor') y `documento` (p. ej. "NV01-000123")
     * en cada movimiento; null cuando no aplica.
     *
     * @param  Collection<int, MovimientoCaja>  $movimientos
     * @return Collection<int, MovimientoCaja>
     */
    public function adjuntar(Collection $movimientos): Collection
    {
        $datos = [];

        foreach ($movimientos->whereNotNull('documento_referencia_tipo')->groupBy('documento_referencia_tipo') as $tipo => $grupo) {
            $ids = $grupo->pluck('documento_referencia_id')->filter()->unique()->values();
            if ($ids->isEmpty()) {
                continue;
            }

            foreach ($this->cargar((string) $tipo, $ids) as $id => $fila) {
                $datos[$tipo][$id] = $fila;
            }
        }

        return $movimientos->each(function (MovimientoCaja $m) use ($datos) {
            [$nombre, $rol, $documento] = $datos[$m->documento_referencia_tipo][$m->documento_referencia_id] ?? [null, null, null];

            $m->setAttribute('contraparte', $nombre ?: null);
            $m->setAttribute('contraparte_tipo', $nombre ? $rol : null);
            $m->setAttribute('documento', $documento ?: null);
        });
    }

    /**
     * @param  Collection<int, int>  $ids
     * @return array<int, array{0: ?string, 1: ?string, 2: ?string}> id del documento → [nombre, rol, número]
     */
    private function cargar(string $tipo, Collection $ids): array
    {
        $serieNumero = fn ($doc) => $doc && ($doc->serie || $doc->numero) ? trim("{$doc->serie}-{$doc->numero}", '-') : null;
        $filas = [];

        switch ($tipo) {
            case 'nota_venta':
                NotaVenta::with('cliente:id,nombre')->whereIn('id', $ids)->get()->each(function ($d) use (&$filas, $serieNumero) {
                    $filas[$d->id] = [$d->cliente?->nombre, 'Cliente', $serieNumero($d)];
                });
                break;

            case 'cuenta_por_cobrar':
                CuentaPorCobrar::with(['cliente:id,nombre', 'notaVenta:id,serie,numero'])->whereIn('id', $ids)->get()->each(function ($d) use (&$filas, $serieNumero) {
                    $cuota = $d->total_cuotas > 1 ? " · cuota {$d->numero_cuota}/{$d->total_cuotas}" : '';
                    $filas[$d->id] = [$d->cliente?->nombre, 'Cliente', ($serieNumero($d->notaVenta) ?? '').$cuota ?: null];
                });
                break;

            case 'letra_cambio':
                LetraCambio::with('cliente:id,nombre')->whereIn('id', $ids)->get()->each(function ($d) use (&$filas) {
                    $filas[$d->id] = [$d->cliente?->nombre, 'Cliente', $d->codigo];
                });
                break;

            case 'anticipo':
                Anticipo::with('cliente:id,nombre')->whereIn('id', $ids)->get()->each(function ($d) use (&$filas) {
                    $filas[$d->id] = [$d->cliente?->nombre, 'Cliente', $d->documento];
                });
                break;

            case 'anticipo_devolucion':
                // La devolución apunta al anticipo, y el anticipo al cliente.
                AnticipoDevolucion::with('anticipo.cliente:id,nombre')->whereIn('id', $ids)->get()->each(function ($d) use (&$filas) {
                    $filas[$d->id] = [$d->anticipo?->cliente?->nombre, 'Cliente', $d->anticipo?->documento];
                });
                break;

            case 'cuenta_por_pagar':
                CuentaPorPagar::with(['proveedor:id,nombre', 'compra:id,serie,numero'])->whereIn('id', $ids)->get()->each(function ($d) use (&$filas, $serieNumero) {
                    $filas[$d->id] = [$d->proveedor?->nombre, 'Proveedor', $serieNumero($d->compra)];
                });
                break;

            case 'compra':
                Compra::with('proveedor:id,nombre')->whereIn('id', $ids)->get()->each(function ($d) use (&$filas, $serieNumero) {
                    $filas[$d->id] = [$d->proveedor?->nombre, 'Proveedor', $serieNumero($d)];
                });
                break;
        }

        return $filas;
    }
}
