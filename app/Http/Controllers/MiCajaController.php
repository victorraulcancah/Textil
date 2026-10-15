<?php

namespace App\Http\Controllers;

use App\Models\AperturaCaja;
use App\Models\Caja;
use App\Models\CierreCaja;
use App\Models\CuentaPorCobrarPago;
use App\Services\CierreCajaService;
use App\Models\MotivoMovimiento;
use App\Models\MovimientoCaja;
use App\Models\NotaVenta;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * "Mi Caja": la caja asignada al usuario. Permite ver su estado, abrirla
 * (apertura con monto inicial) y cerrarla (arqueo: monto contado vs esperado).
 */
class MiCajaController extends Controller
{
    public function show()
    {
        $user = auth('api')->user();
        $cajaId = $user?->cajaActual()?->id;
        if (! $cajaId) {
            return response()->json(['caja' => null, 'apertura' => null, 'resumen' => null]);
        }

        // Toda caja recibe efectivo y las cuentas y billeteras activas de la empresa.
        $caja = Caja::conMediosDePago(Caja::find($cajaId));
        $apertura = AperturaCaja::where('caja_id', $cajaId)
            ->where('estado', 'abierta')
            ->latest('fecha_apertura')
            ->first();

        // Todos mis movimientos, de todas mis aperturas (también con la caja cerrada o en uso por otro).
        $movimientos = $this->misMovimientos($user->id, $cajaId);

        // Caja compartida: si la abrió otro usuario, aquí solo se avisa que está en uso (no se opera).
        if ($apertura && (int) $apertura->usuario_id !== (int) $user->id) {
            return response()->json([
                'caja' => $caja,
                'apertura' => null,
                'resumen' => null,
                'movimientos' => $movimientos,
                'ocupada_por' => ['id' => $apertura->usuario_id, 'name' => $apertura->usuario?->name, 'desde' => $apertura->fecha_apertura],
                'saldo_anterior' => null,
                'cierre_pendiente' => null,
            ]);
        }

        return response()->json([
            'caja' => $caja,
            'apertura' => $apertura,
            'resumen' => $apertura ? $this->resumen($apertura) : null,
            'movimientos' => $movimientos,
            'ocupada_por' => null,
            // Con la caja cerrada: lo que dejó el último cierre aprobado, que es con lo que abre quien sigue.
            'saldo_anterior' => $apertura ? null : $this->saldoAnterior($cajaId),
            // Un cierre que espera aprobación: la caja no se abre hasta que se apruebe (o se anule para corregirlo).
            'cierre_pendiente' => $apertura ? null : $this->cierrePendiente($cajaId, $user->id),
        ]);
    }

    /** El cierre de esta caja que espera aprobación, y si es del usuario que mira. */
    private function cierrePendiente(int $cajaId, int $userId): ?array
    {
        $cierre = CierreCaja::with(['apertura.usuario:id,name', 'cajaDestino:id,codigo,nombre'])
            ->where('estado', CierreCaja::PENDIENTE)
            ->whereHas('apertura', fn ($q) => $q->where('caja_id', $cajaId))
            ->latest('id')->first();

        if (! $cierre) {
            return null;
        }

        return [
            'id' => $cierre->id,
            'solicitante' => $cierre->apertura?->usuario?->name,
            'es_mio' => (int) $cierre->apertura?->usuario_id === $userId,
            'monto_contado' => (float) $cierre->monto_contado,
            'monto_dejado' => $cierre->efectivoParaElSiguiente(),
            'monto_retirado' => (float) $cierre->monto_retirado,
            'caja_destino' => $cierre->cajaDestino ? trim(($cierre->cajaDestino->codigo ? $cierre->cajaDestino->codigo.' · ' : '').$cierre->cajaDestino->nombre) : null,
            'diferencia' => (float) $cierre->diferencia,
            'fecha' => $cierre->fecha_cierre,
        ];
    }

    /** Los movimientos de las aperturas de este usuario en su caja, anulados incluidos (los más recientes primero). */
    private function misMovimientos(int $userId, int $cajaId)
    {
        return MovimientoCaja::withTrashed()->with([
            'motivo:id,nombre,es_sistema',
            'cuentaBancaria:id,alias,numero_cuenta',
            'billetera:id,nombre',
            'apertura:id,caja_id,usuario_id,fecha_apertura,estado',
        ])
            ->whereHas('apertura', fn ($a) => $a->where('usuario_id', $userId)->where('caja_id', $cajaId))
            ->latest('created_at')->latest('id')
            ->limit(500)
            ->get();
    }

    private function movimientos(AperturaCaja $apertura)
    {
        // Los anulados también salen (con su estado); los totales del resumen no los cuentan.
        return MovimientoCaja::withTrashed()->with([
            'motivo:id,nombre',
            'cuentaBancaria:id,alias,numero_cuenta',
            'billetera:id,nombre',
        ])
            ->where('apertura_caja_id', $apertura->id)
            ->latest('created_at')->latest('id')
            ->get();
    }

    /**
     * Corregir un cobro: se anula lo cobrado y se registran los pagos nuevos, todo junto. Sirve cuando se cobró con el
     * método equivocado (efectivo en vez de Yape) o se partió distinto (100 en efectivo y 50 por transferencia).
     *
     * Solo cobros de la caja que el usuario tiene abierta: lo de una caja ya cerrada no se toca, porque su arqueo ya
     * se contó. Los nuevos pagos tienen que sumar lo mismo que se había cobrado.
     */
    public function corregirPago(Request $request, int $movimiento)
    {
        // Se busca con los anulados para poder avisar que ya lo está (el enlace por modelo diría "no existe").
        $movimiento = MovimientoCaja::withTrashed()->findOrFail($movimiento);
        if ($movimiento->trashed()) {
            throw ValidationException::withMessages(['caja' => 'Este cobro ya está anulado'.($movimiento->anulado_motivo ? " ({$movimiento->anulado_motivo})" : '').'.']);
        }

        $user = auth('api')->user();
        $apertura = AperturaCaja::where('caja_id', $user?->cajaActual()?->id)
            ->where('estado', 'abierta')->latest('fecha_apertura')->first();

        if (! $apertura || (int) $apertura->usuario_id !== (int) $user->id) {
            throw ValidationException::withMessages(['caja' => 'Abre tu caja para corregir un cobro.']);
        }
        if ((int) $movimiento->apertura_caja_id !== (int) $apertura->id || $movimiento->tipo !== 'ingreso') {
            throw ValidationException::withMessages(['caja' => 'Solo se corrigen los cobros de la caja que tienes abierta.']);
        }

        $data = $request->validate([
            'pagos' => 'required|array|min:1',
            'pagos.*.forma_pago' => 'required|in:efectivo,transferencia,billetera',
            'pagos.*.cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'pagos.*.billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'pagos.*.monto' => 'required|numeric|min:0.01',
            'pagos.*.referencia' => 'nullable|string|max:100',
        ]);

        foreach ($data['pagos'] as $i => $p) {
            if ($p['forma_pago'] === 'transferencia' && empty($p['cuenta_bancaria_id'])) {
                throw ValidationException::withMessages(["pagos.{$i}.cuenta_bancaria_id" => 'Elige la cuenta bancaria.']);
            }
            if ($p['forma_pago'] === 'billetera' && empty($p['billetera_id'])) {
                throw ValidationException::withMessages(["pagos.{$i}.billetera_id" => 'Elige la billetera.']);
            }
        }

        match ($movimiento->documento_referencia_tipo) {
            'cuenta_por_cobrar' => $this->corregirCobranza($movimiento, $data['pagos']),
            'nota_venta' => $this->corregirVenta($movimiento, $apertura, $data['pagos']),
            default => throw ValidationException::withMessages(['caja' => 'Este movimiento no es un cobro que se pueda corregir.']),
        };

        return $this->show();
    }

    /**
     * Anula un movimiento que el cajero registró a mano (un ingreso por transferencia o Yape, un gasto…): deja de contar
     * en la caja pero sigue en la lista como anulado, con su motivo.
     *
     *  - Un movimiento DIGITAL (transferencia o billetera) se anula aunque sea de un turno ya cerrado: ese dinero está en
     *    el banco, no en el cajón, así que no mueve el arqueo del efectivo.
     *  - Uno en EFECTIVO solo mientras su caja siga abierta: después ya se contó.
     *
     * Lo que nace de una venta o de una cobranza se corrige con "Corregir pago", y los del sistema (el cierre) no se
     * tocan.
     */
    public function anularMovimiento(Request $request, int $movimiento)
    {
        $movimiento = MovimientoCaja::withTrashed()->with(['motivo:id,nombre,es_sistema', 'apertura:id,caja_id,usuario_id'])->findOrFail($movimiento);
        $user = auth('api')->user();

        // Solo los movimientos de los turnos del propio usuario.
        if (! $movimiento->apertura || (int) $movimiento->apertura->usuario_id !== (int) $user?->id) {
            throw ValidationException::withMessages(['caja' => 'Solo puedes anular los movimientos de tus turnos.']);
        }
        if ($movimiento->trashed()) {
            throw ValidationException::withMessages(['caja' => 'Este movimiento ya está anulado.']);
        }

        $esDigital = $movimiento->cuenta_bancaria_id || $movimiento->billetera_id;
        if (! $esDigital) {
            $apertura = AperturaCaja::where('caja_id', $user?->cajaActual()?->id)
                ->where('estado', 'abierta')->where('usuario_id', $user?->id)
                ->latest('fecha_apertura')->first();

            if (! $apertura || (int) $movimiento->apertura_caja_id !== (int) $apertura->id) {
                throw ValidationException::withMessages(['caja' => 'Un movimiento en efectivo solo se anula mientras su caja está abierta: después ya se contó en el arqueo.']);
            }
        }
        if ($movimiento->documento_referencia_tipo) {
            throw ValidationException::withMessages(['caja' => 'Este movimiento viene de una venta, un cobro o un cierre: se corrige desde su documento (Corregir pago).']);
        }
        if ($movimiento->motivo?->es_sistema) {
            throw ValidationException::withMessages(['caja' => 'Es un movimiento del sistema: no se anula a mano.']);
        }

        $datos = $request->validate(['motivo' => 'nullable|string|max:200']);

        MovimientoCaja::anularDe(
            MovimientoCaja::where('id', $movimiento->id),
            trim((string) ($datos['motivo'] ?? '')) ?: 'Anulado por el cajero',
        );

        return $this->show();
    }

    /** Los nuevos pagos deben sumar exactamente lo que se había cobrado. */
    private function exigirMismoTotal(array $pagos, float $esperado, ?string $moneda): void
    {
        $nuevo = round((float) collect($pagos)->sum('monto'), 2);

        if (abs($nuevo - round($esperado, 2)) > 0.009) {
            throw ValidationException::withMessages([
                'pagos' => 'Los pagos nuevos deben sumar exactamente '.number_format($esperado, 2).' '.($moneda ?: 'PEN').' (lo que se había cobrado).',
            ]);
        }
    }

    /** Un cobro de Cuentas por cobrar: se anula ese pago y se registran los nuevos contra la misma deuda. */
    private function corregirCobranza(MovimientoCaja $movimiento, array $pagos): void
    {
        $pago = CuentaPorCobrarPago::where('movimiento_caja_id', $movimiento->id)->first();
        if (! $pago) {
            throw ValidationException::withMessages(['caja' => 'Este cobro ya no tiene su pago registrado.']);
        }
        if ($pago->monto_pen !== null) {
            throw ValidationException::withMessages(['caja' => 'Este cobro se hizo en soles sobre una deuda en dólares: corrígelo desde Cuentas por cobrar.']);
        }

        $cuenta = $pago->cuentaPorCobrar;
        $this->exigirMismoTotal($pagos, (float) $pago->monto, $cuenta->moneda);

        DB::transaction(function () use ($pago, $cuenta, $pagos) {
            $cobranzas = app(CuentaPorCobrarController::class);

            // Primero se anula el cobro (vuelve el saldo a la deuda) y luego se cobra de nuevo.
            $cobranzas->anularPago($pago);
            $cuenta->refresh();

            $respuesta = $cobranzas->registrarPago(
                Request::create('/', 'POST', [
                    'pagos' => $pagos,
                    'glosa' => $pago->glosa,
                    'fecha' => $pago->fecha?->toDateString(),
                ]),
                $cuenta,
            );

            if ($respuesta->getStatusCode() >= 400) {
                $mensaje = json_decode($respuesta->getContent(), true)['message'] ?? 'No se pudo registrar el nuevo cobro.';
                throw ValidationException::withMessages(['pagos' => $mensaje]);
            }
        });
    }

    /** Una venta de contado: se anulan sus cobros (y sus ingresos de caja) y se registran los nuevos. */
    private function corregirVenta(MovimientoCaja $movimiento, AperturaCaja $apertura, array $pagos): void
    {
        $nota = NotaVenta::with('pagos')->find($movimiento->documento_referencia_id);

        if (! $nota || $nota->estado !== 'emitida') {
            throw ValidationException::withMessages(['caja' => 'La venta ya no está vigente: no se puede corregir su cobro.']);
        }
        if ($nota->tipo_pago !== 'contado') {
            throw ValidationException::withMessages(['caja' => 'Esta venta es a crédito: sus cobros se corrigen en Cuentas por cobrar.']);
        }
        if ($nota->pagos->isEmpty()) {
            throw ValidationException::withMessages(['caja' => 'Esta venta no tiene cobros registrados.']);
        }
        if ($nota->pagos->contains(fn ($p) => $p->monto_pen !== null)) {
            throw ValidationException::withMessages(['caja' => 'Esta venta en dólares se cobró con soles: no se corrige desde aquí.']);
        }

        $ingresos = MovimientoCaja::where('documento_referencia_tipo', 'nota_venta')
            ->where('documento_referencia_id', $nota->id)->get();
        if ($ingresos->contains(fn ($m) => (int) $m->apertura_caja_id !== (int) $apertura->id)) {
            throw ValidationException::withMessages(['caja' => 'Parte de este cobro está en una caja ya cerrada: no se puede corregir.']);
        }

        $this->exigirMismoTotal($pagos, (float) $nota->pagos->sum('monto'), $nota->moneda);

        $fecha = $nota->pagos->first()->fecha?->toDateString() ?? now()->toDateString();
        $motivoId = MotivoMovimiento::where('tipo', 'entrada')->where('nombre', 'Ingreso por venta')->value('id');

        DB::transaction(function () use ($nota, $ingresos, $pagos, $apertura, $fecha, $motivoId) {
            // Primero se anula lo cobrado…
            MovimientoCaja::anularDe(MovimientoCaja::whereIn('id', $ingresos->pluck('id')), 'Pago corregido');
            $nota->pagos()->delete();

            // …y luego se registran los pagos nuevos.
            foreach ($pagos as $p) {
                $cuentaId = $p['forma_pago'] === 'transferencia' ? ($p['cuenta_bancaria_id'] ?? null) : null;
                $billeteraId = $p['forma_pago'] === 'billetera' ? ($p['billetera_id'] ?? null) : null;

                $nota->pagos()->create([
                    'metodo_pago_id' => null,
                    'forma_pago' => $p['forma_pago'],
                    'cuenta_bancaria_id' => $cuentaId,
                    'billetera_id' => $billeteraId,
                    'monto' => round((float) $p['monto'], 2),
                    'moneda' => $nota->moneda,
                    'monto_pen' => null,
                    'tipo_cambio' => null,
                    'fecha' => $fecha,
                    'referencia' => $p['referencia'] ?? null,
                ]);

                MovimientoCaja::create([
                    'apertura_caja_id' => $apertura->id,
                    'tipo' => 'ingreso',
                    'motivo_movimiento_id' => $motivoId,
                    'descripcion' => "Venta {$nota->serie}-{$nota->numero}",
                    'cuenta_bancaria_id' => $cuentaId,
                    'billetera_id' => $billeteraId,
                    'monto' => round((float) $p['monto'], 2),
                    'moneda' => $nota->moneda,
                    'fecha' => $fecha,
                    'numero_operacion' => $p['referencia'] ?? null,
                    'documento_referencia_tipo' => 'nota_venta',
                    'documento_referencia_id' => $nota->id,
                ]);
            }
        });
    }

    public function abrir(Request $request)
    {
        $user = auth('api')->user();
        $cajaId = $user?->cajaActual()?->id;
        if (! $cajaId) {
            throw ValidationException::withMessages(['caja' => 'No tienes una caja asignada en este almacén.']);
        }

        // Mientras el cierre anterior espera aprobación, la caja no se abre: no se sabe aún con qué efectivo.
        $pendiente = $this->cierrePendiente($cajaId, $user->id);
        if ($pendiente) {
            throw ValidationException::withMessages(['caja' => 'El cierre de caja de '.($pendiente['solicitante'] ?? 'el turno anterior').' está pendiente de aprobación: podrás abrir cuando se apruebe.']);
        }

        // La caja abre con el efectivo que dejó el último cierre aprobado: lo que se escriba no cuenta. Solo la primera
        // vez que se abre, sin cierre previo, se indica el monto inicial.
        $anterior = $this->saldoAnterior($cajaId);
        $data = $request->validate(['monto_inicial' => ($anterior ? 'nullable' : 'required').'|numeric|min:0']);
        if ($anterior) {
            $data['monto_inicial'] = $anterior['monto'];
        }

        // Entra uno a la vez: el bloqueo evita que dos usuarios de la misma caja la abran en el mismo instante.
        DB::transaction(function () use ($cajaId, $user, $data) {
            Caja::whereKey($cajaId)->lockForUpdate()->first();

            $abierta = AperturaCaja::where('caja_id', $cajaId)->where('estado', 'abierta')->with('usuario:id,name')->first();
            if ($abierta) {
                $mensaje = (int) $abierta->usuario_id === (int) $user->id
                    ? 'La caja ya está abierta.'
                    : 'La caja está en uso: la tiene abierta '.($abierta->usuario?->name ?? 'otro usuario').'. Espera a que la cierre.';
                throw ValidationException::withMessages(['caja' => $mensaje]);
            }

            AperturaCaja::create([
                'caja_id' => $cajaId,
                'usuario_id' => $user->id,
                'monto_inicial' => $data['monto_inicial'],
                'fecha_apertura' => now(),
                'estado' => 'abierta',
            ]);
        });

        return $this->show();
    }

    public function cerrar(Request $request)
    {
        $user = auth('api')->user();
        $data = $request->validate([
            'monto_contado' => 'required|numeric|min:0',
            // Los dólares del cajón se cuentan aparte.
            'monto_contado_usd' => 'nullable|numeric|min:0',
            // Lo que queda en el cajón para quien abre después; el resto sale con el movimiento de cierre.
            'monto_dejado' => 'nullable|numeric|min:0',
            // La caja a la que va el efectivo retirado (opcional).
            'caja_destino_id' => 'nullable|integer|exists:cajas,id',
        ]);

        // Solo cierra la caja quien la abrió.
        $apertura = AperturaCaja::where('caja_id', $user?->cajaActual()?->id)
            ->where('estado', 'abierta')
            ->where('usuario_id', $user?->id)
            ->latest('fecha_apertura')
            ->first();

        if (! $apertura) {
            throw ValidationException::withMessages(['caja' => 'No tienes una caja abierta.']);
        }

        $resumen = $this->resumen($apertura);
        $sistema = $resumen['esperado'];
        $contado = (float) $data['monto_contado'];

        // Si entraron o salieron dólares en efectivo, también se arquean.
        $dolares = $resumen['dolares'];
        $sistemaUsd = $dolares ? $dolares['esperado'] : null;
        if ($sistemaUsd !== null && abs($sistemaUsd) > 0.005 && ! isset($data['monto_contado_usd'])) {
            throw ValidationException::withMessages(['monto_contado_usd' => 'Cuenta también los dólares del cajón.']);
        }
        $contadoUsd = isset($data['monto_contado_usd']) ? (float) $data['monto_contado_usd'] : null;

        // El cierre es un movimiento del sistema que queda pendiente de aprobación.
        app(CierreCajaService::class)->solicitar($apertura, [
            'sistema' => $sistema,
            'contado' => $contado,
            'sistema_usd' => $sistemaUsd,
            'contado_usd' => $contadoUsd,
        ], (float) ($data['monto_dejado'] ?? 0), isset($data['caja_destino_id']) ? (int) $data['caja_destino_id'] : null);

        return $this->show();
    }

    /** Las otras cajas activas de la sucursal a las que se puede enviar el efectivo al cerrar. */
    public function cajasDestino()
    {
        $user = auth('api')->user();
        $propia = $user?->cajaActual();
        if (! $propia) {
            return response()->json([]);
        }

        $abiertas = AperturaCaja::where('estado', 'abierta')->pluck('caja_id')->all();

        return response()->json(
            Caja::where('almacen_id', $propia->almacen_id)->where('activo', true)->where('id', '!=', $propia->id)
                ->orderBy('codigo')->get(['id', 'codigo', 'nombre'])
                ->map(fn ($c) => ['id' => $c->id, 'codigo' => $c->codigo, 'nombre' => $c->nombre, 'abierta' => in_array($c->id, $abiertas, true)])
        );
    }

    /** Quien solicitó el cierre lo anula mientras está pendiente: su caja se reabre para corregirlo y cerrar de nuevo. */
    public function anularCierre()
    {
        $user = auth('api')->user();
        $cajaId = $user?->cajaActual()?->id;

        $cierre = CierreCaja::where('estado', CierreCaja::PENDIENTE)
            ->whereHas('apertura', fn ($a) => $a->where('caja_id', $cajaId)->where('usuario_id', $user?->id))
            ->latest('id')->first();

        if (! $cierre) {
            throw ValidationException::withMessages(['caja' => 'No tienes un cierre pendiente que anular.']);
        }

        app(CierreCajaService::class)->anular($cierre, $user, 'Anulado por quien lo solicitó');

        return $this->show();
    }

    /**
     * Lo que dejó el último cierre de la caja: el efectivo contado (lo que sobró o faltó ya está incluido). null si la
     * caja nunca se cerró.
     */
    private function saldoAnterior(?int $cajaId): ?array
    {
        if (! $cajaId) {
            return null;
        }

        $cierre = CierreCaja::with('apertura.usuario:id,name')
            ->where('estado', CierreCaja::APROBADO)
            ->whereHas('apertura', fn ($q) => $q->where('caja_id', $cajaId))
            ->latest('fecha_cierre')->latest('id')
            ->first();

        if (! $cierre) {
            return null;
        }

        return [
            // Con lo que abre quien sigue: lo que se dejó en el cajón (en cierres anteriores, todo lo contado).
            'monto' => $cierre->efectivoParaElSiguiente(),
            'contado' => round((float) $cierre->monto_contado, 2),
            'retirado' => round((float) $cierre->monto_retirado, 2),
            'diferencia' => round((float) $cierre->diferencia, 2),
            'cerro' => $cierre->apertura?->usuario?->name,
            'fecha' => $cierre->fecha_cierre,
        ];
    }

    /** Resumen del efectivo esperado en la apertura. */
    /**
     * En la caja física solo hay billetes y monedas. Un cobro por Yape o
     * transferencia queda registrado como movimiento, pero el dinero entra al
     * banco, no al cajón: si se sumara al esperado, el arqueo saldría siempre
     * con faltante. Por eso `esperado` cuenta únicamente el efectivo, y lo
     * demás se informa aparte.
     */
    public function resumen(AperturaCaja $apertura): array
    {
        $todos = MovimientoCaja::where('apertura_caja_id', $apertura->id)
            ->get(['tipo', 'monto', 'moneda', 'cuenta_bancaria_id', 'billetera_id']);

        // Soles y dólares no se suman: lo de arriba es en soles y los dólares
        // van en su propio bloque (null si no hubo ninguno).
        $movimientos = $todos->filter(fn ($m) => ($m->moneda ?: 'PEN') === 'PEN');
        $dolares = $todos->where('moneda', 'USD');

        $enEfectivo = fn ($m) => ! $m->cuenta_bancaria_id && ! $m->billetera_id;

        $suma = fn ($coleccion) => round((float) $coleccion->sum('monto'), 2);

        $ingresos = $movimientos->where('tipo', 'ingreso');
        $egresos = $movimientos->where('tipo', 'egreso');

        $inicial = round((float) $apertura->monto_inicial, 2);
        $efectivoIngresos = $suma($ingresos->filter($enEfectivo));
        $efectivoEgresos = $suma($egresos->filter($enEfectivo));

        return [
            'monto_inicial' => $inicial,
            'ingresos' => $suma($ingresos),
            'egresos' => $suma($egresos),
            // Desglose: lo que se cuenta a mano y lo que no.
            'efectivo_ingresos' => $efectivoIngresos,
            'efectivo_egresos' => $efectivoEgresos,
            'otros_ingresos' => $suma($ingresos->reject($enEfectivo)),
            'otros_egresos' => $suma($egresos->reject($enEfectivo)),
            'esperado' => round($inicial + $efectivoIngresos - $efectivoEgresos, 2),
            'movimientos' => $todos->count(),
            'dolares' => $dolares->isEmpty() ? null : $this->bloqueDolares($dolares, $enEfectivo, $suma),
        ];
    }

    /** Lo mismo para los dólares: el cajón arranca sin dólares. */
    private function bloqueDolares($dolares, $enEfectivo, $suma): array
    {
        $ingresos = $dolares->where('tipo', 'ingreso');
        $egresos = $dolares->where('tipo', 'egreso');
        $efectivoIngresos = $suma($ingresos->filter($enEfectivo));
        $efectivoEgresos = $suma($egresos->filter($enEfectivo));

        return [
            'ingresos' => $suma($ingresos),
            'egresos' => $suma($egresos),
            'efectivo_ingresos' => $efectivoIngresos,
            'efectivo_egresos' => $efectivoEgresos,
            'otros_ingresos' => $suma($ingresos->reject($enEfectivo)),
            'otros_egresos' => $suma($egresos->reject($enEfectivo)),
            'esperado' => round($efectivoIngresos - $efectivoEgresos, 2),
        ];
    }
}
