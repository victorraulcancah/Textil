<?php

namespace App\Services;

use App\Models\Anticipo;
use App\Models\AnticipoDevolucion;
use App\Models\BilleteraDigital;
use App\Models\Cliente;
use App\Models\CuentaBancaria;
use App\Models\MovimientoCaja;
use App\Models\NotaVentaPago;
use App\Models\SerieDocumento;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Anticipos de clientes: se registran con el ingreso que dejan en la caja de quien los recibe, se corrigen en su fecha
 * y datos, y se anulan mientras no se hayan aplicado a una venta.
 */
class AnticipoService
{
    public function __construct(private readonly CajaService $cajas) {}

    /**
     * Registra el anticipo y su ingreso en la caja abierta de quien lo recibe (sin caja abierta no hay dónde anotarlo).
     *
     * @param  array{cliente_id: int, fecha?: ?string, moneda: string, monto: float|string, forma_pago: string, cuenta_bancaria_id?: ?int, billetera_id?: ?int, referencia?: ?string, observaciones?: ?string}  $datos
     */
    public function registrar(array $datos, ?User $usuario = null): Anticipo
    {
        $usuario ??= auth('api')->user() ?? auth()->user();
        $apertura = $this->cajas->exigirApertura($usuario);
        $almacenId = (int) $apertura->caja->almacen_id;

        [$cuentaId, $billeteraId] = $this->metodo($datos);

        return DB::transaction(function () use ($datos, $usuario, $apertura, $almacenId, $cuentaId, $billeteraId) {
            $serie = Anticipo::serieDeAlmacen($almacenId);
            $fecha = ! empty($datos['fecha']) ? $datos['fecha'] : now()->toDateString();
            $monto = round((float) $datos['monto'], 2);

            $anticipo = Anticipo::create([
                'serie' => $serie,
                'numero' => $this->siguienteNumero($serie, $almacenId),
                'almacen_id' => $almacenId,
                'cliente_id' => $datos['cliente_id'],
                'usuario_id' => $usuario->id,
                'fecha' => $fecha,
                'moneda' => $datos['moneda'],
                'monto' => $monto,
                'forma_pago' => $datos['forma_pago'],
                'cuenta_bancaria_id' => $cuentaId,
                'billetera_id' => $billeteraId,
                'referencia' => $datos['forma_pago'] === 'efectivo' ? null : ($datos['referencia'] ?? null),
                'observaciones' => $datos['observaciones'] ?? null,
                'estado' => Anticipo::VIGENTE,
            ]);

            $movimiento = MovimientoCaja::create([
                'apertura_caja_id' => $apertura->id,
                'tipo' => 'ingreso',
                'motivo_movimiento_id' => $this->cajas->motivo('Ingreso por anticipo'),
                'descripcion' => "Anticipo {$anticipo->documento}",
                'cuenta_bancaria_id' => $cuentaId,
                'billetera_id' => $billeteraId,
                'monto' => $monto,
                'moneda' => $datos['moneda'],
                'fecha' => $fecha,
                'numero_operacion' => $anticipo->referencia,
                'documento_referencia_tipo' => 'anticipo',
                'documento_referencia_id' => $anticipo->id,
            ]);

            $anticipo->update(['movimiento_caja_id' => $movimiento->id]);

            return $anticipo;
        });
    }

    /**
     * Convierte un ingreso que se registró a mano —cuando todavía no había anticipos— en el anticipo de un cliente. No entra
     * plata nueva: el ingreso que ya está en la caja (y en su arqueo) pasa a ser el ingreso del anticipo, con su mismo
     * día, monto y método. El anticipo queda a nombre de quien recibió el dinero, en el almacén de su caja.
     */
    public function desdeMovimiento(MovimientoCaja $movimiento, int $clienteId, ?string $observaciones = null): Anticipo
    {
        $movimiento->loadMissing(['apertura.caja', 'motivo:id,nombre,es_sistema']);

        if ($movimiento->trashed()) {
            throw ValidationException::withMessages(['caja' => 'Este movimiento está anulado.']);
        }
        if ($movimiento->tipo !== 'ingreso' || $movimiento->documento_referencia_tipo || $movimiento->motivo?->es_sistema) {
            throw ValidationException::withMessages(['caja' => 'Solo un ingreso registrado a mano se convierte en anticipo.']);
        }
        if ($movimiento->por_aprobar) {
            throw ValidationException::withMessages(['caja' => 'Este ingreso espera aprobación: no se convierte todavía.']);
        }

        $almacenId = (int) $movimiento->apertura?->caja?->almacen_id;
        $moneda = $movimiento->moneda ?: 'PEN';
        $forma = $movimiento->cuenta_bancaria_id ? 'transferencia' : ($movimiento->billetera_id ? 'billetera' : 'efectivo');

        return DB::transaction(function () use ($movimiento, $clienteId, $observaciones, $almacenId, $moneda, $forma) {
            $serie = Anticipo::serieDeAlmacen($almacenId);

            $anticipo = Anticipo::create([
                'serie' => $serie,
                'numero' => $this->siguienteNumero($serie, $almacenId),
                'almacen_id' => $almacenId,
                'cliente_id' => $clienteId,
                // Quien recibió el dinero es el dueño del turno donde está el ingreso.
                'usuario_id' => $movimiento->apertura->usuario_id,
                'fecha' => $movimiento->fecha?->toDateString() ?? now()->toDateString(),
                'moneda' => $moneda,
                'monto' => round((float) $movimiento->monto, 2),
                'forma_pago' => $forma,
                'cuenta_bancaria_id' => $movimiento->cuenta_bancaria_id,
                'billetera_id' => $movimiento->billetera_id,
                'referencia' => $forma === 'efectivo' ? null : $movimiento->numero_operacion,
                'movimiento_caja_id' => $movimiento->id,
                'observaciones' => filled($observaciones) ? $observaciones : $movimiento->descripcion,
                'estado' => Anticipo::VIGENTE,
            ]);

            $antes = trim((string) $movimiento->descripcion);
            $movimiento->forceFill([
                'motivo_movimiento_id' => $this->cajas->motivo('Ingreso por anticipo'),
                'documento_referencia_tipo' => 'anticipo',
                'documento_referencia_id' => $anticipo->id,
                'descripcion' => "Anticipo {$anticipo->documento}".($antes !== '' ? " · {$antes}" : ''),
            ])->save();

            return $anticipo;
        });
    }

    /** Cambia lo que no mueve plata: el día, la referencia y las observaciones. El ingreso en caja los sigue. */
    public function actualizar(Anticipo $anticipo, array $datos): Anticipo
    {
        $this->exigirVigente($anticipo);

        return DB::transaction(function () use ($anticipo, $datos) {
            $cambios = [];
            if (! empty($datos['fecha'])) {
                $cambios['fecha'] = $datos['fecha'];
            }
            if (array_key_exists('observaciones', $datos)) {
                $cambios['observaciones'] = filled($datos['observaciones']) ? $datos['observaciones'] : null;
            }
            if (array_key_exists('referencia', $datos) && $anticipo->forma_pago !== 'efectivo') {
                $cambios['referencia'] = filled($datos['referencia']) ? $datos['referencia'] : null;
            }
            $anticipo->update($cambios);

            if ($anticipo->movimiento_caja_id) {
                $enCaja = [];
                if (isset($cambios['fecha'])) {
                    $enCaja['fecha'] = $cambios['fecha'];
                }
                if (array_key_exists('referencia', $cambios)) {
                    $enCaja['numero_operacion'] = $cambios['referencia'];
                }
                if ($enCaja) {
                    MovimientoCaja::where('id', $anticipo->movimiento_caja_id)->update($enCaja);
                }
            }

            return $anticipo->fresh();
        });
    }

    /**
     * Anula el anticipo: el ingreso deja de contar en la caja. No se anula uno que ya se aplicó a una venta, y el
     * efectivo de un turno ya cerrado no se toca (su arqueo ya se contó): se anula el digital o el de la caja abierta.
     */
    public function anular(Anticipo $anticipo, ?string $motivo = null): Anticipo
    {
        $this->exigirVigente($anticipo);

        if ((float) $anticipo->monto_aplicado > 0) {
            throw ValidationException::withMessages(['anticipo' => 'Este anticipo ya se aplicó a una venta: no se puede anular.']);
        }
        if ((float) $anticipo->monto_devuelto > 0) {
            throw ValidationException::withMessages(['anticipo' => 'Este anticipo ya tiene devoluciones: anúlalas primero.']);
        }

        $movimiento = $anticipo->movimiento_caja_id ? MovimientoCaja::with('apertura:id,estado')->find($anticipo->movimiento_caja_id) : null;
        if ($movimiento && $anticipo->forma_pago === 'efectivo' && $movimiento->apertura?->estado !== 'abierta') {
            throw ValidationException::withMessages(['anticipo' => 'El efectivo de una caja ya cerrada no se anula: ya se contó en el arqueo.']);
        }

        return DB::transaction(function () use ($anticipo, $motivo, $movimiento) {
            if ($movimiento) {
                MovimientoCaja::anularDe(MovimientoCaja::where('id', $movimiento->id), 'Anticipo anulado');
            }

            $anticipo->update([
                'estado' => Anticipo::ANULADO,
                'motivo_anulacion' => filled($motivo) ? $motivo : 'Anulado',
                'usuario_anula_id' => auth('api')->id() ?? auth()->id(),
                'fecha_anulacion' => now(),
            ]);

            return $anticipo->fresh();
        });
    }

    /**
     * Los anticipos vigentes de un cliente (de todos los almacenes) con en qué ventas se usaron, y cuánto tiene a favor
     * por moneda: lo recibido, lo aplicado y lo que queda. Los anulados no cuentan.
     *
     * @return array{lista: list<array<string, mixed>>, resumen: array<string, array{recibido: float, aplicado: float, saldo: float}>}
     */
    public function delCliente(Cliente $cliente): array
    {
        $anticipos = Anticipo::with(['almacen:id,nombre', 'cuentaBancaria:id,alias,numero_cuenta', 'billetera:id,nombre'])
            ->where('cliente_id', $cliente->id)
            ->where('estado', Anticipo::VIGENTE)
            ->orderBy('fecha')->orderBy('id')
            ->get();

        // Las ventas anuladas devolvieron su anticipo: no cuentan como aplicación.
        $usos = NotaVentaPago::with('notaVenta:id,serie,numero,fecha_emision,estado')
            ->whereIn('anticipo_id', $anticipos->pluck('id'))
            ->get()
            ->filter(fn ($p) => $p->notaVenta?->estado === 'emitida')
            ->groupBy('anticipo_id');

        $lista = $anticipos->map(fn (Anticipo $a) => [
            'id' => $a->id,
            'documento' => $a->documento,
            'fecha' => $a->fecha?->toDateString(),
            'registrado' => $a->created_at?->toIso8601String(),
            'almacen' => $a->almacen?->nombre,
            'moneda' => $a->moneda,
            'metodo' => $a->cuentaBancaria ? 'Transferencia · '.($a->cuentaBancaria->alias ?: $a->cuentaBancaria->numero_cuenta) : ($a->billetera?->nombre ?? 'Efectivo'),
            'referencia' => $a->referencia,
            'observaciones' => $a->observaciones,
            'monto' => round((float) $a->monto, 2),
            'aplicado' => round((float) $a->monto_aplicado, 2),
            'devuelto' => round((float) $a->monto_devuelto, 2),
            'saldo' => round((float) $a->saldo, 2),
            'aplicaciones' => ($usos[$a->id] ?? collect())->map(fn ($p) => [
                'documento' => "{$p->notaVenta->serie}-{$p->notaVenta->numero}",
                'fecha' => $p->fecha?->toDateString(),
                'monto' => round((float) $p->monto, 2),
            ])->values()->all(),
        ])->values()->all();

        $resumen = $anticipos->groupBy('moneda')->map(fn ($grupo) => [
            'recibido' => round((float) $grupo->sum('monto'), 2),
            'aplicado' => round((float) $grupo->sum('monto_aplicado'), 2),
            'devuelto' => round((float) $grupo->sum('monto_devuelto'), 2),
            'saldo' => round((float) $grupo->sum(fn (Anticipo $a) => (float) $a->saldo), 2),
        ])->all();

        return ['lista' => $lista, 'resumen' => $resumen];
    }

    /**
     * Devuelve al cliente lo que sobra de un anticipo, en uno o varios métodos (pago mixto). Cada método sale como un egreso
     * de la caja abierta de quien devuelve, y el saldo del anticipo baja por el total devuelto. Solo se devuelve el saldo:
     * lo que ya se aplicó a ventas no.
     *
     * @param  array{fecha?: ?string, observaciones?: ?string, pagos: list<array{forma_pago: string, monto: float|string, cuenta_bancaria_id?: ?int, billetera_id?: ?int, referencia?: ?string}>}  $datos
     */
    public function devolver(Anticipo $anticipo, array $datos, ?User $usuario = null): AnticipoDevolucion
    {
        $usuario ??= auth('api')->user() ?? auth()->user();
        $this->exigirVigente($anticipo);

        $pagos = collect($datos['pagos'])->map(fn ($p) => $p + ['monto' => 0])->filter(fn ($p) => (float) $p['monto'] > 0)->values();
        $total = round((float) $pagos->sum(fn ($p) => (float) $p['monto']), 2);
        if ($pagos->isEmpty() || $total <= 0) {
            throw ValidationException::withMessages(['pagos' => 'Indica cuánto se devuelve y con qué método.']);
        }
        if ($total > round((float) $anticipo->saldo, 2) + 0.001) {
            throw ValidationException::withMessages(['pagos' => 'Solo se puede devolver el saldo del anticipo: '.number_format((float) $anticipo->saldo, 2).'.']);
        }
        foreach ($pagos as $p) {
            $this->metodo(['forma_pago' => $p['forma_pago'], 'cuenta_bancaria_id' => $p['cuenta_bancaria_id'] ?? null, 'billetera_id' => $p['billetera_id'] ?? null]);
        }

        // La devolución sale de la caja abierta de quien la hace.
        $apertura = $this->cajas->exigirApertura($usuario);

        return DB::transaction(function () use ($anticipo, $datos, $usuario, $apertura, $pagos, $total) {
            $fecha = ! empty($datos['fecha']) ? $datos['fecha'] : now()->toDateString();

            $devolucion = AnticipoDevolucion::create([
                'anticipo_id' => $anticipo->id,
                'usuario_id' => $usuario->id,
                'fecha' => $fecha,
                'moneda' => $anticipo->moneda,
                'monto' => $total,
                'observaciones' => $datos['observaciones'] ?? null,
                'estado' => AnticipoDevolucion::VIGENTE,
            ]);

            $cliente = $anticipo->cliente()->value('nombre');
            foreach ($pagos as $p) {
                $cuentaId = $p['forma_pago'] === 'transferencia' ? ($p['cuenta_bancaria_id'] ?? null) : null;
                $billeteraId = $p['forma_pago'] === 'billetera' ? ($p['billetera_id'] ?? null) : null;
                $referencia = $p['forma_pago'] === 'efectivo' ? null : ($p['referencia'] ?? null);

                $movimiento = MovimientoCaja::create([
                    'apertura_caja_id' => $apertura->id,
                    'tipo' => 'egreso',
                    'motivo_movimiento_id' => $this->cajas->motivo('Devolución de anticipo'),
                    'descripcion' => "Devolución del anticipo {$anticipo->documento}".($cliente ? " a {$cliente}" : ''),
                    'cuenta_bancaria_id' => $cuentaId,
                    'billetera_id' => $billeteraId,
                    'monto' => round((float) $p['monto'], 2),
                    'moneda' => $anticipo->moneda,
                    'fecha' => $fecha,
                    'numero_operacion' => $referencia,
                    'documento_referencia_tipo' => 'anticipo_devolucion',
                    'documento_referencia_id' => $devolucion->id,
                ]);

                $devolucion->pagos()->create([
                    'forma_pago' => $p['forma_pago'],
                    'cuenta_bancaria_id' => $cuentaId,
                    'billetera_id' => $billeteraId,
                    'monto' => round((float) $p['monto'], 2),
                    'referencia' => $referencia,
                    'movimiento_caja_id' => $movimiento->id,
                ]);
            }

            $anticipo->increment('monto_devuelto', $total);

            return $devolucion->load('pagos');
        });
    }

    /**
     * Anula una devolución: sus egresos de caja dejan de contar y el saldo vuelve al anticipo. El efectivo de un turno ya
     * cerrado no se toca (su arqueo ya se contó): se anula el digital o el de la caja abierta.
     */
    public function anularDevolucion(AnticipoDevolucion $devolucion, ?string $motivo = null): AnticipoDevolucion
    {
        if ($devolucion->estado === AnticipoDevolucion::ANULADA) {
            throw ValidationException::withMessages(['devolucion' => 'Esta devolución ya está anulada.']);
        }

        $devolucion->load('pagos.movimientoCaja.apertura:id,estado');
        foreach ($devolucion->pagos as $pago) {
            $m = $pago->movimientoCaja;
            if ($m && $pago->forma_pago === 'efectivo' && $m->apertura?->estado !== 'abierta') {
                throw ValidationException::withMessages(['devolucion' => 'Parte de esta devolución fue en efectivo de una caja ya cerrada: no se anula, ya se contó en el arqueo.']);
            }
        }

        return DB::transaction(function () use ($devolucion, $motivo) {
            foreach ($devolucion->pagos as $pago) {
                if ($pago->movimiento_caja_id) {
                    MovimientoCaja::anularDe(MovimientoCaja::where('id', $pago->movimiento_caja_id), 'Devolución anulada');
                }
            }

            Anticipo::where('id', $devolucion->anticipo_id)
                ->update(['monto_devuelto' => DB::raw('GREATEST(monto_devuelto - '.(float) $devolucion->monto.', 0)')]);

            $devolucion->update([
                'estado' => AnticipoDevolucion::ANULADA,
                'anulada_por' => auth('api')->id() ?? auth()->id(),
                'anulada_en' => now(),
                'motivo_anulacion' => filled($motivo) ? $motivo : 'Anulada',
            ]);

            return $devolucion->fresh('pagos');
        });
    }

    private function exigirVigente(Anticipo $anticipo): void
    {
        if ($anticipo->estado === Anticipo::ANULADO) {
            throw ValidationException::withMessages(['anticipo' => 'Este anticipo está anulado.']);
        }
    }

    /** La cuenta o la billetera según el método; un método digital exige una activa. */
    private function metodo(array $datos): array
    {
        $cuentaId = null;
        $billeteraId = null;

        if ($datos['forma_pago'] === 'transferencia') {
            $cuentaId = $datos['cuenta_bancaria_id'] ?? null;
            if (! $cuentaId || ! CuentaBancaria::whereKey($cuentaId)->where('activo', true)->exists()) {
                throw ValidationException::withMessages(['cuenta_bancaria_id' => 'Selecciona una cuenta bancaria activa.']);
            }
        } elseif ($datos['forma_pago'] === 'billetera') {
            $billeteraId = $datos['billetera_id'] ?? null;
            if (! $billeteraId || ! BilleteraDigital::whereKey($billeteraId)->where('activo', true)->exists()) {
                throw ValidationException::withMessages(['billetera_id' => 'Selecciona una billetera activa.']);
            }
        }

        return [$cuentaId, $billeteraId];
    }

    private function siguienteNumero(string $serie, int $almacenId): string
    {
        $serieDoc = SerieDocumento::where('tipo_documento', 'anticipo')
            ->where('serie', $serie)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'anticipo', 'serie' => $serie],
                ['numero_actual' => 0, 'activo' => true, 'almacen_id' => $almacenId],
            );

        $serieDoc->increment('numero_actual');

        return str_pad((string) $serieDoc->numero_actual, 4, '0', STR_PAD_LEFT);
    }
}
