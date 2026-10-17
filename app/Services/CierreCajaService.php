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

        [$destino, $aperturaDestino] = $this->resolverDestino($apertura, $cajaDestinoId, $retirado);

        return DB::transaction(function () use ($apertura, $arqueo, $contado, $dejado, $retirado, $destino, $aperturaDestino) {
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

            $this->registrarMovimientos($cierre, $apertura, $retirado, $dejado, $destino, $aperturaDestino);

            $apertura->update(['estado' => 'cerrada']);

            return $cierre->refresh();
        });
    }

    /**
     * Recierre: corrige los datos de un cierre ya hecho —lo contado, lo que se deja, los dólares y la caja destino— sin
     * reabrir la caja. El retiro y el ingreso en la caja destino se rehacen con lo nuevo y el cierre vuelve a quedar
     * pendiente de aprobación. Lo que esperaba el sistema al cerrar no cambia.
     *
     * El turno siguiente, si ya se abrió, conserva el saldo con el que abrió: un recierre no lo cambia.
     *
     * @param  array{monto_contado: float|string, monto_dejado?: float|string|null, monto_contado_usd?: float|string|null, caja_destino_id?: int|null, motivo: string}  $datos
     */
    public function recerrar(CierreCaja $cierre, array $datos, User $por): CierreCaja
    {
        $cierre->loadMissing('apertura.caja');
        $apertura = $cierre->apertura;

        // Un cierre anulado solo se vuelve a cerrar si su turno quedó cerrado sin otro cierre vigente: pasa a pendiente con lo
        // corregido. Si la anulación reabrió la caja, ese turno se cierra de nuevo desde Mi Caja.
        if ($cierre->estado === CierreCaja::ANULADO) {
            $otroVigente = CierreCaja::where('apertura_caja_id', $cierre->apertura_caja_id)->where('id', '!=', $cierre->id)
                ->where('estado', '!=', CierreCaja::ANULADO)->exists();
            if ($apertura->estado !== 'cerrada' || $otroVigente) {
                throw ValidationException::withMessages(['cierre' => 'Este cierre anulado no se puede volver a cerrar: '
                    .($otroVigente ? 'ese turno ya tiene otro cierre.' : 'la caja quedó abierta para cerrarla de nuevo desde Mi Caja.')]);
            }
        }

        $contado = round((float) $datos['monto_contado'], 2);
        $dejado = round((float) ($datos['monto_dejado'] ?? 0), 2);
        $retirado = round($contado - $dejado, 2);
        if ($dejado < 0 || $retirado < 0) {
            throw ValidationException::withMessages(['monto_dejado' => 'No puedes dejar más de lo que contaste.']);
        }

        // Los dólares del cajón, si el sistema esperaba dólares, también se cuentan.
        $sistemaUsd = $cierre->monto_sistema_usd !== null ? (float) $cierre->monto_sistema_usd : null;
        $contadoUsd = isset($datos['monto_contado_usd']) && $datos['monto_contado_usd'] !== '' ? round((float) $datos['monto_contado_usd'], 2) : null;
        if ($sistemaUsd !== null && abs($sistemaUsd) > 0.005 && $contadoUsd === null) {
            throw ValidationException::withMessages(['monto_contado_usd' => 'Cuenta también los dólares del cajón.']);
        }

        [$destino, $aperturaDestino] = $this->resolverDestino($apertura, isset($datos['caja_destino_id']) ? (int) $datos['caja_destino_id'] : null, $retirado);

        // Si el efectivo ya contó en el turno cerrado de otra caja, ese arqueo ya está hecho: no se rehace.
        $ingresoViejo = $cierre->movimiento_destino_id
            ? MovimientoCaja::withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS)->withTrashed()->with('apertura:id,estado')->find($cierre->movimiento_destino_id)
            : null;
        if ($ingresoViejo && ! $ingresoViejo->trashed() && ! $ingresoViejo->por_aprobar && $ingresoViejo->apertura?->estado !== 'abierta') {
            throw ValidationException::withMessages(['cierre' => 'La caja destino ya cerró el turno en que recibió este efectivo: el cierre no se puede corregir.']);
        }

        return DB::transaction(function () use ($cierre, $apertura, $por, $datos, $contado, $dejado, $retirado, $contadoUsd, $sistemaUsd, $destino, $aperturaDestino) {
            // Lo que había (el retiro y el ingreso en la otra caja) se anula y se rehace con lo nuevo: el rastro queda.
            foreach ([$cierre->movimiento_caja_id, $cierre->movimiento_destino_id] as $id) {
                if ($id) {
                    MovimientoCaja::anularDe(
                        MovimientoCaja::withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS)->where('id', $id),
                        'Cierre corregido (recierre)',
                    );
                }
            }
            $cierre->update(['movimiento_caja_id' => null, 'movimiento_destino_id' => null]);

            $this->registrarMovimientos($cierre, $apertura, $retirado, $dejado, $destino, $aperturaDestino);

            $cierre->update([
                'monto_contado' => $contado,
                'diferencia' => round($contado - (float) $cierre->monto_sistema, 2),
                'monto_contado_usd' => $contadoUsd,
                'diferencia_usd' => $sistemaUsd !== null && $contadoUsd !== null ? round($contadoUsd - $sistemaUsd, 2) : null,
                'monto_dejado' => $dejado,
                'monto_retirado' => $retirado,
                'caja_destino_id' => $destino?->id,
                // Corregido, vuelve a esperar a que alguien lo apruebe.
                'estado' => CierreCaja::PENDIENTE,
                'aprobado_por' => null,
                'aprobado_en' => null,
                'anulado_por' => null,
                'anulado_en' => null,
                'anulado_motivo' => null,
                'recerrado_por' => $por->id,
                'recerrado_en' => now(),
                'recerrado_motivo' => $datos['motivo'],
                'veces_recerrado' => (int) $cierre->veces_recerrado + 1,
            ]);

            return $cierre->refresh();
        });
    }

    /**
     * La caja a la que va el efectivo retirado (opcional, de la misma sucursal) y su turno abierto. El efectivo le
     * aparece a esa caja de inmediato (por aprobar), así que necesita un turno abierto donde mostrarlo.
     *
     * @return array{0: ?Caja, 1: ?AperturaCaja}
     */
    private function resolverDestino(AperturaCaja $apertura, ?int $cajaDestinoId, float $retirado): array
    {
        if (! $cajaDestinoId) {
            return [null, null];
        }

        $destino = Caja::find($cajaDestinoId);
        $origen = Caja::find($apertura->caja_id);
        if (! $destino || ! $destino->activo || (int) $destino->id === (int) $apertura->caja_id
            || (int) $destino->almacen_id !== (int) $origen?->almacen_id) {
            throw ValidationException::withMessages(['caja_destino_id' => 'Elige otra caja activa de tu sucursal.']);
        }
        if ($retirado <= 0) {
            throw ValidationException::withMessages(['caja_destino_id' => 'No hay efectivo que enviar: deja menos de lo que contaste para enviarlo.']);
        }

        $aperturaDestino = AperturaCaja::where('caja_id', $destino->id)->where('estado', 'abierta')->latest('fecha_apertura')->first();
        if (! $aperturaDestino) {
            throw ValidationException::withMessages(['caja_destino_id' => 'La caja destino debe estar abierta para recibir el efectivo: elige otra o pídele que la abra.']);
        }

        return [$destino, $aperturaDestino];
    }

    /**
     * Lo que deja un cierre en las cajas: el retiro sale de la caja que cierra (no hay movimiento si no se retira nada)
     * y, si va a otra caja, allí entra como un ingreso del sistema, visible desde ya y por aprobar.
     */
    private function registrarMovimientos(CierreCaja $cierre, AperturaCaja $apertura, float $retirado, float $dejado, ?Caja $destino, ?AperturaCaja $aperturaDestino): void
    {
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

        if ($aperturaDestino) {
            $origen = Caja::find($apertura->caja_id);
            $ingreso = MovimientoCaja::create([
                'apertura_caja_id' => $aperturaDestino->id,
                'tipo' => 'ingreso',
                'motivo_movimiento_id' => MotivoMovimiento::where('ambito', 'caja')->where('nombre', self::MOTIVO_INGRESO)->value('id'),
                'monto' => $retirado,
                'moneda' => 'PEN',
                'descripcion' => 'Efectivo del cierre de '.trim(($origen?->codigo ? $origen->codigo.' · ' : '').($origen?->nombre ?? 'otra caja')).' (por aprobar)',
                'documento_referencia_tipo' => 'cierre_caja',
                'documento_referencia_id' => $cierre->id,
                'fecha' => now()->toDateString(),
                'por_aprobar' => true,
            ]);
            $cierre->update(['movimiento_destino_id' => $ingreso->id]);
        }
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

        // El ingreso que espera en la caja destino pasa a contar. Si ese turno ya se cerró, el ingreso se muda al turno que
        // tenga abierto la caja; si no tiene ninguno, no hay dónde recibirlo y se pide que la abra.
        $ingreso = $cierre->movimiento_destino_id
            ? MovimientoCaja::withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS)->with('apertura:id,caja_id,estado')->find($cierre->movimiento_destino_id)
            : null;
        $aperturaNueva = null;

        // Un cierre pedido antes de que el ingreso apareciera en la caja destino al cerrar: no tiene ingreso todavía, y
        // se le crea al aprobar (la caja destino debe estar abierta).
        $crearIngreso = ! $ingreso && $cierre->caja_destino_id && (float) $cierre->monto_retirado > 0;
        if ($crearIngreso) {
            $aperturaNueva = AperturaCaja::where('caja_id', $cierre->caja_destino_id)->where('estado', 'abierta')->latest('fecha_apertura')->first();
            if (! $aperturaNueva) {
                $destino = $cierre->cajaDestino;
                throw ValidationException::withMessages([
                    'cierre' => 'La caja destino ('.trim(($destino?->codigo ? $destino->codigo.' · ' : '').($destino?->nombre ?? '')).') debe estar abierta para recibir el efectivo: pídele que la abra y vuelve a aprobar.',
                ]);
            }
        }

        if ($ingreso && $ingreso->apertura?->estado !== 'abierta') {
            $aperturaNueva = AperturaCaja::where('caja_id', $cierre->caja_destino_id)->where('estado', 'abierta')->latest('fecha_apertura')->first();
            if (! $aperturaNueva) {
                $destino = $cierre->cajaDestino;
                throw ValidationException::withMessages([
                    'cierre' => 'La caja destino ('.trim(($destino?->codigo ? $destino->codigo.' · ' : '').($destino?->nombre ?? '')).') debe estar abierta para recibir el efectivo: pídele que la abra y vuelve a aprobar.',
                ]);
            }
        }

        return DB::transaction(function () use ($cierre, $por, $ingreso, $aperturaNueva, $crearIngreso) {
            if ($crearIngreso) {
                $origen = $cierre->apertura?->caja;
                $nuevo = MovimientoCaja::create([
                    'apertura_caja_id' => $aperturaNueva->id,
                    'tipo' => 'ingreso',
                    'motivo_movimiento_id' => MotivoMovimiento::where('ambito', 'caja')->where('nombre', self::MOTIVO_INGRESO)->value('id'),
                    'monto' => $cierre->monto_retirado,
                    'moneda' => 'PEN',
                    'descripcion' => 'Efectivo del cierre de '.trim(($origen?->codigo ? $origen->codigo.' · ' : '').($origen?->nombre ?? 'otra caja')),
                    'documento_referencia_tipo' => 'cierre_caja',
                    'documento_referencia_id' => $cierre->id,
                    'fecha' => now()->toDateString(),
                ]);
                $cierre->update(['movimiento_destino_id' => $nuevo->id]);
            } elseif ($ingreso) {
                $ingreso->forceFill([
                    'por_aprobar' => false,
                    'descripcion' => preg_replace('/ \(por aprobar\)$/', '', (string) $ingreso->descripcion),
                    ...($aperturaNueva ? ['apertura_caja_id' => $aperturaNueva->id] : []),
                ])->save();
            }

            $cierre->update([
                'estado' => CierreCaja::APROBADO,
                'aprobado_por' => $por->id,
                'aprobado_en' => now(),
            ]);

            return $cierre->refresh();
        });
    }

    /**
     * Pone al día lo que el sistema esperaba al cerrar cuando cambian los movimientos del turno ya cerrado (se anuló o
     * se corrigió uno): vuelve a calcular el esperado —sin contar el retiro del propio cierre— y la diferencia con lo
     * que se contó. Lo contado, lo que se dejó y el retiro no cambian: eso se corrige con un recierre.
     */
    public function recalcularEsperado(CierreCaja $cierre): CierreCaja
    {
        $cierre->loadMissing('apertura');
        if ($cierre->estado === CierreCaja::ANULADO) {
            return $cierre;
        }

        $resumen = app(CajaResumenService::class)->deApertura($cierre->apertura);

        // El retiro del propio cierre ya figura como un egreso del turno: el esperado de antes de cerrar lo suma de vuelta.
        $retiro = $cierre->movimiento_caja_id
            ? MovimientoCaja::where('id', $cierre->movimiento_caja_id)->value('monto')
            : null;
        $sistema = round((float) $resumen['esperado'] + (float) ($retiro ?? 0), 2);
        $sistemaUsd = $resumen['dolares']['esperado'] ?? null;

        $cierre->update([
            'monto_sistema' => $sistema,
            'diferencia' => round((float) $cierre->monto_contado - $sistema, 2),
            'monto_sistema_usd' => $sistemaUsd,
            'diferencia_usd' => $sistemaUsd !== null && $cierre->monto_contado_usd !== null
                ? round((float) $cierre->monto_contado_usd - (float) $sistemaUsd, 2)
                : null,
        ]);

        return $cierre->refresh();
    }

    /** ¿La caja ya se abrió con otro turno después de este cierre? */
    public function cajaReabierta(CierreCaja $cierre): bool
    {
        $cierre->loadMissing('apertura');

        return AperturaCaja::where('caja_id', $cierre->apertura->caja_id)->where('id', '>', $cierre->apertura->id)->exists();
    }

    /**
     * Anula un cierre: sus movimientos (el retiro y, si lo hubo, el ingreso en la caja destino) quedan anulados y
     * dejan de contar.
     *
     *  - Si la caja sigue como la dejó, se reabre para contar de nuevo y cerrar otra vez.
     *  - Si la caja ya se abrió con otro turno, el turno de este cierre se queda cerrado (no se reabre) y los turnos
     *    posteriores no se tocan: solo se anula el cierre y su retiro.
     */
    public function anular(CierreCaja $cierre, User $por, ?string $motivo = null): CierreCaja
    {
        $cierre->loadMissing('apertura');
        $apertura = $cierre->apertura;

        if ($cierre->estado === CierreCaja::ANULADO) {
            throw ValidationException::withMessages(['cierre' => 'Este cierre ya está anulado.']);
        }
        $reabierta = $this->cajaReabierta($cierre);

        // Si el efectivo ya llegó a otra caja y esa caja ya cerró su turno, no se puede deshacer: ya lo contó.
        if ($cierre->movimiento_destino_id) {
            $ingreso = MovimientoCaja::withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS)->withTrashed()->with('apertura:id,estado')->find($cierre->movimiento_destino_id);
            if ($ingreso && ! $ingreso->trashed() && ! $ingreso->por_aprobar && $ingreso->apertura?->estado !== 'abierta') {
                throw ValidationException::withMessages(['cierre' => 'La caja destino ya cerró el turno en que recibió este efectivo: el cierre no se puede anular.']);
            }
        }

        return DB::transaction(function () use ($cierre, $apertura, $por, $motivo, $reabierta) {
            if ($cierre->movimiento_caja_id) {
                MovimientoCaja::anularDe(MovimientoCaja::where('id', $cierre->movimiento_caja_id), 'Cierre anulado');
            }
            if ($cierre->movimiento_destino_id) {
                MovimientoCaja::anularDe(
                    MovimientoCaja::withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS)->where('id', $cierre->movimiento_destino_id),
                    'Cierre anulado',
                );
            }

            $cierre->update([
                'estado' => CierreCaja::ANULADO,
                'anulado_por' => $por->id,
                'anulado_en' => now(),
                'anulado_motivo' => $motivo ?: 'Anulado para corregirlo',
            ]);

            // La caja vuelve a quedar abierta: se cuenta de nuevo y se cierra con lo correcto. Si ya se abrió otro turno, el
            // de este cierre sigue cerrado.
            if (! $reabierta) {
                $apertura->update(['estado' => 'abierta']);
            }

            return $cierre->refresh();
        });
    }
}
