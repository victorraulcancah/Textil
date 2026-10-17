<?php

namespace App\Services;

use App\Http\Controllers\CuentaPorCobrarController;
use App\Http\Controllers\CuentaPorPagarController;
use App\Models\Anticipo;
use App\Models\CuentaPorCobrarPago;
use App\Models\CuentaPorPagarPago;
use App\Models\MotivoMovimiento;
use App\Models\MovimientoCaja;
use App\Models\NotaVenta;
use App\Models\User;
use App\Support\AlmacenAcceso;
use App\Support\Permisos;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Anular y editar los movimientos de una caja, sea desde Mi Caja (los de tus turnos) o desde Cierres de caja (los de
 * cualquier turno, para quien gestiona los cierres). Cada movimiento se opera según el documento del que nace.
 */
class MovimientoCajaService
{
    /** Reglas de lo que llega al editar un movimiento. */
    public const REGLAS_EDICION = [
        // El día en que pasó de verdad: cualquiera hasta hoy, nunca uno futuro.
        'fecha' => 'nullable|date|before_or_equal:today',
        'descripcion' => 'nullable|string|max:255',
        'numero_operacion' => 'nullable|string|max:100',
        'motivo_movimiento_id' => 'nullable|exists:motivos_movimiento,id',
        'forma' => 'nullable|in:efectivo,transferencia,billetera',
        'cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
        'billetera_id' => 'nullable|exists:billeteras_digitales,id',
        'monto' => 'nullable|numeric|min:0.01',
    ];

    /**
     * Anula un movimiento: deja de contar en la caja pero sigue en la lista como anulado, con su motivo.
     *
     *  - Lo DIGITAL (transferencia o billetera) se anula aunque sea de un turno ya cerrado: ese dinero está en el banco,
     *    no en el cajón, así que no mueve el arqueo del efectivo.
     *  - Lo que está en EFECTIVO solo mientras su caja siga abierta: después ya se contó. Quien gestiona los cierres
     *    (`$gestor`) sí puede, y después corrige el cierre.
     *  - Un cobro o un pago de una cuenta se anula en su cuenta (la deuda recupera el saldo); un cobro de venta anula la
     *    proforma completa; un anticipo se anula como anticipo; una compra o una letra se anulan desde su documento.
     */
    public function anular(MovimientoCaja $movimiento, string $motivo, User $user, bool $gestor = false): void
    {
        $this->exigirOperable($movimiento, $user, 'anular', $gestor);

        if (! $gestor && ! $this->esDigital($movimiento) && ! $this->turnoAbierto($movimiento)) {
            throw ValidationException::withMessages(['caja' => 'Un movimiento en efectivo solo se anula mientras su caja está abierta: después ya se contó en el arqueo.']);
        }

        match ($movimiento->documento_referencia_tipo) {
            null => $this->anularManual($movimiento, $motivo),
            'cuenta_por_cobrar' => $this->anularPagoDeCuenta($movimiento, true),
            'cuenta_por_pagar' => $this->anularPagoDeCuenta($movimiento, false),
            'nota_venta' => $this->anularVenta($movimiento, $motivo, $gestor),
            'anticipo' => $this->anularAnticipo($movimiento, $motivo),
            'compra' => throw ValidationException::withMessages(['caja' => 'Esta salida viene de una compra: se anula desde Compras.']),
            'letra_cambio' => throw ValidationException::withMessages(['caja' => 'Este cobro viene de una letra de cambio: se anula desde Letras de cambio.']),
            default => throw ValidationException::withMessages(['caja' => 'Este movimiento no se anula a mano.']),
        };
    }

    /**
     * Edita un movimiento. Qué se puede cambiar depende de dónde nace:
     *
     *  - Ingreso o gasto a mano: fecha, descripción, N.° de operación, motivo, método y monto.
     *  - Cobro o pago de una cuenta: fecha, descripción y N.° de operación (el monto y el método, anulando el pago).
     *  - Cobro de una venta: solo la fecha (el monto y el método se cambian con «Corregir pago»).
     *  - Anticipo: fecha y N.° de operación. Compra o letra: solo la descripción.
     *
     * Regla del arqueo: el monto o el método del EFECTIVO de un turno ya cerrado no se cambian, porque ya se contó; quien
     * gestiona los cierres (`$gestor`) sí puede y después corrige el cierre. La fecha y la descripción siempre.
     */
    public function editar(MovimientoCaja $movimiento, array $data, User $user, bool $gestor = false): void
    {
        $this->exigirOperable($movimiento, $user, 'editar', $gestor);

        match ($movimiento->documento_referencia_tipo) {
            null => $this->editarManual($movimiento, $data, $gestor),
            'cuenta_por_cobrar' => $this->editarPagoDeCuenta($movimiento, $data, true),
            'cuenta_por_pagar' => $this->editarPagoDeCuenta($movimiento, $data, false),
            'nota_venta' => $this->editarFechaDeVenta($movimiento, $data),
            'anticipo' => $this->editarAnticipo($movimiento, $data),
            'compra', 'letra_cambio' => $this->editarDescripcion($movimiento, $data),
            default => throw ValidationException::withMessages(['caja' => 'Este movimiento no se edita a mano.']),
        };
    }

    /**
     * Que el movimiento se pueda operar: tiene turno, está vigente y no es del cierre de caja (el cierre se anula o se
     * corrige desde su pantalla). Quien no es gestor solo opera los movimientos de sus propios turnos.
     */
    private function exigirOperable(MovimientoCaja $movimiento, User $user, string $accion, bool $gestor): void
    {
        $movimiento->loadMissing(['motivo:id,nombre,es_sistema', 'apertura:id,caja_id,usuario_id,estado']);

        if (! $movimiento->apertura || (! $gestor && (int) $movimiento->apertura->usuario_id !== (int) $user->id)) {
            throw ValidationException::withMessages(['caja' => "Solo puedes {$accion} los movimientos de tus turnos."]);
        }
        if ($movimiento->trashed()) {
            throw ValidationException::withMessages(['caja' => 'Este movimiento ya está anulado.']);
        }
        if ($movimiento->documento_referencia_tipo === 'cierre_caja') {
            throw ValidationException::withMessages(['caja' => 'Es el movimiento de un cierre de caja: no se toca desde aquí (el cierre se anula o se corrige desde su pantalla).']);
        }
    }

    /** ¿Es dinero que está en el banco o la billetera y no en el cajón? Eso no mueve el arqueo del efectivo. */
    private function esDigital(MovimientoCaja $movimiento): bool
    {
        return (bool) ($movimiento->cuenta_bancaria_id || $movimiento->billetera_id);
    }

    /** ¿Su turno sigue abierto? Después de cerrarlo, el efectivo ya se contó y aprobó. */
    private function turnoAbierto(MovimientoCaja $movimiento): bool
    {
        return $movimiento->apertura?->estado === 'abierta';
    }

    /** Quien opera el documento desde la caja necesita el mismo permiso que le pediría su propia pantalla. */
    private function exigirPermiso(string $ruta, string $metodo, string $mensaje): void
    {
        $permiso = Permisos::paraPeticion($ruta, $metodo);

        if ($permiso && ! Permisos::puede(auth('api')->user(), $permiso)) {
            throw ValidationException::withMessages(['caja' => $mensaje]);
        }
    }

    /** Un ingreso o gasto que el cajero registró a mano. */
    private function anularManual(MovimientoCaja $movimiento, string $motivo): void
    {
        if ($movimiento->motivo?->es_sistema) {
            throw ValidationException::withMessages(['caja' => 'Es un movimiento del sistema: no se anula a mano.']);
        }

        MovimientoCaja::anularDe(MovimientoCaja::where('id', $movimiento->id), $motivo ?: 'Anulado por el cajero');
    }

    /** El cobro (o el pago) de una cuenta: se anula ese pago y la deuda recupera su saldo. */
    private function anularPagoDeCuenta(MovimientoCaja $movimiento, bool $cobrar): void
    {
        $pago = $cobrar
            ? CuentaPorCobrarPago::where('movimiento_caja_id', $movimiento->id)->first()
            : CuentaPorPagarPago::where('movimiento_caja_id', $movimiento->id)->first();

        if (! $pago) {
            throw ValidationException::withMessages(['caja' => 'Este movimiento ya no tiene su pago registrado.']);
        }

        $this->exigirPermiso(
            ($cobrar ? 'cuentas-por-cobrar' : 'cuentas-por-pagar').'/pagos/'.$pago->id,
            'DELETE',
            'No tienes permiso para anular pagos de '.($cobrar ? 'Cuentas por cobrar' : 'Cuentas por pagar').'.',
        );

        $cobrar
            ? app(CuentaPorCobrarController::class)->anularPago($pago)
            : app(CuentaPorPagarController::class)->anularPago($pago);
    }

    /** Un anticipo de cliente: se anula el anticipo (el servicio revisa que no esté aplicado ni en una caja ya cerrada). */
    private function anularAnticipo(MovimientoCaja $movimiento, string $motivo): void
    {
        $anticipo = Anticipo::find($movimiento->documento_referencia_id);
        if (! $anticipo) {
            throw ValidationException::withMessages(['caja' => 'El anticipo de este movimiento ya no existe.']);
        }

        AlmacenAcceso::exigir($anticipo->almacen_id);
        $this->exigirPermiso('anticipos/'.$anticipo->id.'/anular', 'POST', 'No tienes permiso para anular anticipos.');

        app(AnticipoService::class)->anular($anticipo, $motivo ?: 'Anulado desde Mi Caja');
    }

    /** El cobro de una venta: se anula la proforma completa (stock, cobros y deuda). */
    private function anularVenta(MovimientoCaja $movimiento, string $motivo, bool $gestor = false): void
    {
        $nota = NotaVenta::find($movimiento->documento_referencia_id);
        if (! $nota) {
            throw ValidationException::withMessages(['caja' => 'La venta de este cobro ya no existe.']);
        }

        AlmacenAcceso::exigir($nota->almacen_id);
        $this->exigirPermiso('notas-venta/'.$nota->id.'/anular', 'POST', 'No tienes permiso para anular proformas.');

        // El efectivo de un turno ya cerrado no se toca: su arqueo ya se contó y se aprobó.
        $enCajaCerrada = MovimientoCaja::where('documento_referencia_tipo', 'nota_venta')
            ->where('documento_referencia_id', $nota->id)
            ->whereNull('cuenta_bancaria_id')->whereNull('billetera_id')
            ->whereHas('apertura', fn ($a) => $a->where('estado', '!=', 'abierta'))
            ->exists();
        if ($enCajaCerrada && ! $gestor) {
            throw ValidationException::withMessages(['caja' => 'Parte de este cobro es efectivo de una caja ya cerrada: la venta no se puede anular desde aquí.']);
        }

        try {
            app(NotaVentaService::class)->anular($nota, $motivo ?: 'Anulada desde Mi Caja');
        } catch (\DomainException|\RuntimeException|\InvalidArgumentException $e) {
            throw ValidationException::withMessages(['caja' => $e->getMessage()]);
        }
    }

    /** Un ingreso o gasto registrado a mano. */
    private function editarManual(MovimientoCaja $movimiento, array $data, bool $gestor = false): void
    {
        if ($movimiento->motivo?->es_sistema) {
            throw ValidationException::withMessages(['caja' => 'Es un movimiento del sistema: no se edita a mano.']);
        }

        $cambios = [];
        if (! empty($data['fecha'])) {
            $cambios['fecha'] = $data['fecha'];
        }
        if (array_key_exists('descripcion', $data)) {
            $cambios['descripcion'] = filled($data['descripcion']) ? $data['descripcion'] : null;
        }

        // El motivo debe seguir correspondiendo al tipo (ingreso→entrada, egreso→salida) y no ser del sistema.
        if (! empty($data['motivo_movimiento_id']) && (int) $data['motivo_movimiento_id'] !== (int) $movimiento->motivo_movimiento_id) {
            $motivo = MotivoMovimiento::findOrFail($data['motivo_movimiento_id']);
            if ($motivo->tipo !== ($movimiento->tipo === 'ingreso' ? 'entrada' : 'salida')) {
                throw ValidationException::withMessages(['motivo_movimiento_id' => "El motivo \"{$motivo->nombre}\" no corresponde a un ".($movimiento->tipo === 'ingreso' ? 'ingreso' : 'egreso').'.']);
            }
            if ($motivo->es_sistema) {
                throw ValidationException::withMessages(['motivo_movimiento_id' => "El motivo \"{$motivo->nombre}\" es del sistema y no se usa a mano."]);
            }
            $cambios['motivo_movimiento_id'] = $motivo->id;
        }

        // Método y monto.
        $formaActual = $movimiento->cuenta_bancaria_id ? 'transferencia' : ($movimiento->billetera_id ? 'billetera' : 'efectivo');
        $forma = $data['forma'] ?? $formaActual;
        $cuentaId = null;
        $billeteraId = null;
        if ($forma === 'transferencia') {
            $cuentaId = $data['cuenta_bancaria_id'] ?? $movimiento->cuenta_bancaria_id;
            if (! $cuentaId || ! \App\Models\CuentaBancaria::whereKey($cuentaId)->where('activo', true)->exists()) {
                throw ValidationException::withMessages(['cuenta_bancaria_id' => 'Selecciona una cuenta bancaria activa.']);
            }
        } elseif ($forma === 'billetera') {
            $billeteraId = $data['billetera_id'] ?? $movimiento->billetera_id;
            if (! $billeteraId || ! \App\Models\BilleteraDigital::whereKey($billeteraId)->where('activo', true)->exists()) {
                throw ValidationException::withMessages(['billetera_id' => 'Selecciona una billetera activa.']);
            }
        }
        $monto = isset($data['monto']) ? round((float) $data['monto'], 2) : (float) $movimiento->monto;

        $cambiaDinero = $forma !== $formaActual || abs($monto - (float) $movimiento->monto) > 0.004;
        $tocaEfectivo = $formaActual === 'efectivo' || $forma === 'efectivo';
        if ($cambiaDinero && $tocaEfectivo && ! $gestor && ! $this->turnoAbierto($movimiento)) {
            throw ValidationException::withMessages(['caja' => 'El efectivo de una caja ya cerrada no cambia de monto ni de método: ya se contó en el arqueo. Puedes cambiar la fecha y la descripción.']);
        }

        $cambios['cuenta_bancaria_id'] = $cuentaId;
        $cambios['billetera_id'] = $billeteraId;
        $cambios['monto'] = $monto;
        $cambios['numero_operacion'] = $forma === 'efectivo'
            ? null
            : (array_key_exists('numero_operacion', $data) ? (filled($data['numero_operacion']) ? $data['numero_operacion'] : null) : $movimiento->numero_operacion);

        $movimiento->update($cambios);
    }

    /** El cobro (o pago) de una cuenta: fecha, descripción y N.° de operación, con el mismo ajuste que su pantalla. */
    private function editarPagoDeCuenta(MovimientoCaja $movimiento, array $data, bool $cobrar): void
    {
        $pago = $cobrar
            ? CuentaPorCobrarPago::where('movimiento_caja_id', $movimiento->id)->first()
            : CuentaPorPagarPago::where('movimiento_caja_id', $movimiento->id)->first();

        if (! $pago) {
            throw ValidationException::withMessages(['caja' => 'Este movimiento ya no tiene su pago registrado.']);
        }

        $this->exigirPermiso(
            ($cobrar ? 'cuentas-por-cobrar' : 'cuentas-por-pagar').'/pagos/'.$pago->id,
            'PUT',
            'No tienes permiso para editar pagos de '.($cobrar ? 'Cuentas por cobrar' : 'Cuentas por pagar').'.',
        );

        $enSoles = $pago->monto_pen !== null;
        $descripcion = array_key_exists('descripcion', $data) && filled($data['descripcion']) ? $data['descripcion'] : null;

        // Se vuelve a mandar lo mismo (monto, método) con lo que cambia: así el ajuste de la deuda y de la caja es el de siempre.
        $payload = [
            'forma_pago' => $pago->forma_pago,
            'cuenta_bancaria_id' => $pago->cuenta_bancaria_id,
            'billetera_id' => $pago->billetera_id,
            'monto' => $enSoles ? (float) $pago->monto_pen : (float) $pago->monto,
            'referencia' => array_key_exists('numero_operacion', $data) ? (filled($data['numero_operacion']) ? $data['numero_operacion'] : null) : $pago->referencia,
            'fecha' => $data['fecha'] ?? $pago->fecha?->toDateString(),
            ...($enSoles ? ['moneda' => 'PEN', 'tipo_cambio' => (float) $pago->tipo_cambio] : []),
            ...($cobrar ? ['glosa' => $descripcion ?? $pago->glosa] : []),
        ];

        DB::transaction(function () use ($cobrar, $pago, $payload, $movimiento, $descripcion) {
            $peticion = Request::create('/', 'PUT', $payload);
            $respuesta = $cobrar
                ? app(CuentaPorCobrarController::class)->actualizarPago($peticion, $pago)
                : app(CuentaPorPagarController::class)->actualizarPago($peticion, $pago);

            if ($respuesta->getStatusCode() >= 400) {
                $mensaje = json_decode($respuesta->getContent(), true)['message'] ?? 'No se pudo editar el pago.';
                throw ValidationException::withMessages(['caja' => $mensaje]);
            }

            if ($descripcion !== null) {
                MovimientoCaja::where('id', $movimiento->id)->update(['descripcion' => $descripcion]);
            }
        });
    }

    /**
     * Un cobro de venta: solo la fecha. Todos sus cobros y movimientos comparten el día, así que cambiarla los
     * mueve juntos. No puede ser antes de la venta ni futura.
     */
    private function editarFechaDeVenta(MovimientoCaja $movimiento, array $data): void
    {
        if (empty($data['fecha'])) {
            throw ValidationException::withMessages(['fecha' => 'De un cobro de venta solo se cambia la fecha: elige la nueva. El monto y el método se cambian con «Corregir pago».']);
        }

        $nota = NotaVenta::find($movimiento->documento_referencia_id);
        if (! $nota) {
            throw ValidationException::withMessages(['caja' => 'La venta de este cobro ya no existe.']);
        }

        AlmacenAcceso::exigir($nota->almacen_id);
        $this->exigirPermiso('notas-venta/'.$nota->id, 'PUT', 'No tienes permiso para editar proformas.');

        if ($data['fecha'] < $nota->fecha_emision->toDateString()) {
            throw ValidationException::withMessages(['fecha' => 'El cobro no puede ser anterior a la fecha de la venta ('.$nota->fecha_emision->format('d/m/Y').').']);
        }

        DB::transaction(function () use ($nota, $data) {
            $nota->pagos()->update(['fecha' => $data['fecha']]);
            MovimientoCaja::where('documento_referencia_tipo', 'nota_venta')
                ->where('documento_referencia_id', $nota->id)
                ->update(['fecha' => $data['fecha']]);
        });
    }

    /** Un anticipo de cliente: fecha y N.° de operación; el anticipo y su ingreso en caja los siguen. */
    private function editarAnticipo(MovimientoCaja $movimiento, array $data): void
    {
        $anticipo = Anticipo::find($movimiento->documento_referencia_id);
        if (! $anticipo) {
            throw ValidationException::withMessages(['caja' => 'El anticipo de este movimiento ya no existe.']);
        }

        AlmacenAcceso::exigir($anticipo->almacen_id);
        $this->exigirPermiso('anticipos/'.$anticipo->id, 'PUT', 'No tienes permiso para editar anticipos.');

        app(AnticipoService::class)->actualizar($anticipo, array_filter([
            'fecha' => $data['fecha'] ?? null,
            'referencia' => array_key_exists('numero_operacion', $data) ? ($data['numero_operacion'] ?? '') : null,
        ], fn ($v) => $v !== null));
    }

    /** Una salida por compra o un cobro de letra: por ahora solo se cambia la descripción. */
    private function editarDescripcion(MovimientoCaja $movimiento, array $data): void
    {
        if (! array_key_exists('descripcion', $data)) {
            throw ValidationException::withMessages(['descripcion' => 'De este movimiento solo se cambia la descripción: escríbela.']);
        }

        $movimiento->update(['descripcion' => filled($data['descripcion']) ? $data['descripcion'] : null]);
    }
}
