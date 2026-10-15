<?php

namespace App\Services;

use App\Models\AperturaCaja;
use App\Models\Caja;
use App\Models\CierreCaja;
use App\Models\MotivoMovimiento;
use App\Models\MovimientoCaja;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * El cierre de caja como movimiento del sistema que se aprueba.
 *
 * Al cerrar se cuenta el efectivo y se indica cuánto se deja para el turno siguiente; lo demás sale de la caja como un
 * egreso con el motivo "Movimiento de cierre de caja". El cierre queda pendiente hasta que alguien con permiso lo
 * aprueba. Quien lo solicitó (o quien aprueba) puede anularlo: eso reabre la caja y deja constancia.
 */
class CierreCajaService
{
    public const MOTIVO = 'Movimiento de cierre de caja';
    public const MOTIVO_INGRESO = 'Ingreso por cierre de caja';

    /**
     * Registra el cierre pendiente: el arqueo, el egreso de lo retirado y la caja queda cerrada.
     *
     * @param  array{sistema: float, contado: float, sistema_usd: ?float, contado_usd: ?float}  $arqueo
     */
    public function solicitar(AperturaCaja $apertura, array $arqueo, float $dejado, ?int $cajaDestinoId = null): CierreCaja
    {
        $contado = round($arqueo['contado'], 2);
        $dejado = round($dejado, 2);
        $retirado = round($contado - $dejado, 2);

        if ($dejado < 0 || $retirado < 0) {
            throw ValidationException::withMessages(['monto_dejado' => 'No puedes dejar más de lo que contaste.']);
        }

        // El efectivo retirado puede enviarse a otra caja de la misma sucursal.
        $destino = null;
        if ($cajaDestinoId) {
            $destino = Caja::find($cajaDestinoId);
            $origen = Caja::find($apertura->caja_id);
            if (! $destino || ! $destino->activo || (int) $destino->id === (int) $apertura->caja_id
                || (int) $destino->almacen_id !== (int) $origen?->almacen_id) {
                throw ValidationException::withMessages(['caja_destino_id' => 'Elige otra caja activa de tu sucursal.']);
            }
            if ($retirado <= 0) {
                throw ValidationException::withMessages(['caja_destino_id' => 'No hay efectivo que enviar: deja menos de lo que contaste para enviarlo.']);
            }
        }

        return DB::transaction(function () use ($apertura, $arqueo, $contado, $dejado, $retirado, $destino) {
            $cierre = CierreCaja::create([
                'apertura_caja_id' => $apertura->id,
                'monto_sistema' => $arqueo['sistema'],
                'monto_contado' => $contado,
                'diferencia' => round($contado - $arqueo['sistema'], 2),
                'monto_sistema_usd' => $arqueo['sistema_usd'],
                'monto_contado_usd' => $arqueo['contado_usd'],
                'diferencia_usd' => $arqueo['sistema_usd'] !== null && $arqueo['contado_usd'] !== null
                    ? round($arqueo['contado_usd'] - $arqueo['sistema_usd'], 2)
                    : null,
                'fecha_cierre' => now(),
                'monto_dejado' => $dejado,
                'monto_retirado' => $retirado,
                'caja_destino_id' => $destino?->id,
                'estado' => CierreCaja::PENDIENTE,
            ]);

            // Lo retirado sale de la caja con un movimiento del sistema (no hay movimiento si no se retira nada).
            if ($retirado > 0) {
                $movimiento = MovimientoCaja::create([
                    'apertura_caja_id' => $apertura->id,
                    'tipo' => 'egreso',
                    'motivo_movimiento_id' => MotivoMovimiento::where('ambito', 'caja')->where('nombre', self::MOTIVO)->value('id'),
                    'monto' => $retirado,
                    'moneda' => 'PEN',
                    'descripcion' => 'Cierre de caja: efectivo '.($destino ? 'enviado a '.trim(($destino->codigo ? $destino->codigo.' · ' : '').$destino->nombre) : 'retirado')
                        .', quedan '.number_format($dejado, 2).' para el siguiente turno',
                    'documento_referencia_tipo' => 'cierre_caja',
                    'documento_referencia_id' => $cierre->id,
                    'fecha' => now()->toDateString(),
                ]);
                $cierre->update(['movimiento_caja_id' => $movimiento->id]);
            }

            $apertura->update(['estado' => 'cerrada']);

            return $cierre->refresh();
        });
    }

    /** Aprueba un cierre pendiente. Quien lo solicitó no aprueba el suyo. */
    public function aprobar(CierreCaja $cierre, User $por): CierreCaja
    {
        $cierre->loadMissing('apertura');

        if ($cierre->estado !== CierreCaja::PENDIENTE) {
            throw ValidationException::withMessages(['cierre' => 'Este cierre ya está '.$cierre->estado.'.']);
        }
        if ((int) $cierre->apertura?->usuario_id === (int) $por->id) {
            throw ValidationException::withMessages(['cierre' => 'No puedes aprobar tu propio cierre: lo aprueba otra persona.']);
        }

        // El efectivo que va a otra caja le llega como ingreso al aprobar: su turno debe estar abierto para recibirlo.
        $destino = ($cierre->caja_destino_id && (float) $cierre->monto_retirado > 0) ? $cierre->cajaDestino : null;
        $aperturaDestino = null;
        if ($destino) {
            $aperturaDestino = AperturaCaja::where('caja_id', $destino->id)->where('estado', 'abierta')->latest('fecha_apertura')->first();
            if (! $aperturaDestino) {
                throw ValidationException::withMessages([
                    'cierre' => 'La caja destino ('.trim(($destino->codigo ? $destino->codigo.' · ' : '').$destino->nombre).') debe estar abierta para recibir el efectivo: pídele que la abra y vuelve a aprobar.',
                ]);
            }
        }

        return DB::transaction(function () use ($cierre, $por, $aperturaDestino) {
            $ingresoId = null;
            if ($aperturaDestino) {
                $origen = $cierre->apertura?->caja;
                $ingreso = MovimientoCaja::create([
                    'apertura_caja_id' => $aperturaDestino->id,
                    'tipo' => 'ingreso',
                    'motivo_movimiento_id' => MotivoMovimiento::where('ambito', 'caja')->where('nombre', self::MOTIVO_INGRESO)->value('id'),
                    'monto' => $cierre->monto_retirado,
                    'moneda' => 'PEN',
                    'descripcion' => 'Efectivo del cierre de '.trim(($origen?->codigo ? $origen->codigo.' · ' : '').($origen?->nombre ?? 'otra caja')),
                    'documento_referencia_tipo' => 'cierre_caja',
                    'documento_referencia_id' => $cierre->id,
                    'fecha' => now()->toDateString(),
                ]);
                $ingresoId = $ingreso->id;
            }

            $cierre->update([
                'estado' => CierreCaja::APROBADO,
                'aprobado_por' => $por->id,
                'aprobado_en' => now(),
                'movimiento_destino_id' => $ingresoId,
            ]);

            return $cierre->refresh();
        });
    }

    /**
     * Anula un cierre: su movimiento queda anulado (no cuenta) y la caja se reabre para contar de nuevo y cerrar otra
     * vez. No se puede si la caja ya volvió a abrirse con otro turno.
     */
    public function anular(CierreCaja $cierre, User $por, ?string $motivo = null): CierreCaja
    {
        $cierre->loadMissing('apertura');
        $apertura = $cierre->apertura;

        if ($cierre->estado === CierreCaja::ANULADO) {
            throw ValidationException::withMessages(['cierre' => 'Este cierre ya está anulado.']);
        }
        if (AperturaCaja::where('caja_id', $apertura->caja_id)->where('id', '>', $apertura->id)->exists()) {
            throw ValidationException::withMessages(['cierre' => 'La caja ya se volvió a abrir con otro turno: este cierre no se puede anular.']);
        }

        // Si el efectivo ya llegó a otra caja y esa caja ya cerró su turno, no se puede deshacer: ya lo contó.
        if ($cierre->movimiento_destino_id) {
            $ingreso = MovimientoCaja::withTrashed()->with('apertura:id,estado')->find($cierre->movimiento_destino_id);
            if ($ingreso && ! $ingreso->trashed() && $ingreso->apertura?->estado !== 'abierta') {
                throw ValidationException::withMessages(['cierre' => 'La caja destino ya cerró el turno en que recibió este efectivo: el cierre no se puede anular.']);
            }
        }

        return DB::transaction(function () use ($cierre, $apertura, $por, $motivo) {
            if ($cierre->movimiento_caja_id) {
                MovimientoCaja::anularDe(MovimientoCaja::where('id', $cierre->movimiento_caja_id), 'Cierre anulado');
            }
            if ($cierre->movimiento_destino_id) {
                MovimientoCaja::anularDe(MovimientoCaja::where('id', $cierre->movimiento_destino_id), 'Cierre anulado');
            }

            $cierre->update([
                'estado' => CierreCaja::ANULADO,
                'anulado_por' => $por->id,
                'anulado_en' => now(),
                'anulado_motivo' => $motivo ?: 'Anulado para corregirlo',
            ]);

            // La caja vuelve a quedar abierta: se cuenta de nuevo y se cierra con lo correcto.
            $apertura->update(['estado' => 'abierta']);

            return $cierre->refresh();
        });
    }
}
