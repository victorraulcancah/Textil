<?php

namespace App\Http\Controllers;

use App\Models\AperturaCaja;
use App\Models\Caja;
use App\Models\MovimientoCaja;
use App\Models\MotivoMovimiento;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MovimientoCajaController extends Controller
{
    private const WITH = [
        'motivo:id,nombre,tipo,es_sistema',
        'cuentaBancaria:id,alias,numero_cuenta',
        'billetera:id,nombre',
        // Solo la caja de la apertura: cargar la apertura entera (montos,
        // fechas, estado) por cada movimiento engordaba el JSON sin uso.
        'apertura:id,caja_id',
        'apertura.caja:id,nombre,codigo,almacen_id',
    ];

    public function index(Request $request)
    {
        return response()->json(
            $this->consulta($request)->latest('created_at')->latest('id')->limit(500)->get()
        );
    }

    /**
     * Los movimientos que puede ver quien pide, con los filtros de caja y de fecha (desde/hasta). La usan el listado
     * y el reporte (Excel y PDF), así los dos ven exactamente lo mismo.
     */
    public function consulta(Request $request)
    {
        $user = auth('api')->user();
        $cajaPropia = $user?->cajaActual()?->id;

        // Con los anulados: el historial muestra todo, cada movimiento con su estado.
        return MovimientoCaja::withTrashed()->withoutGlobalScope(MovimientoCaja::FILTRO_APROBADOS)->with(self::WITH)
            ->when($request->filled('caja_id'), fn ($q) => $q->whereHas('apertura', fn ($a) => $a->where('caja_id', $request->integer('caja_id'))))
            ->when($request->filled('desde'), fn ($q) => $q->whereDate('fecha', '>=', $request->input('desde')))
            ->when($request->filled('hasta'), fn ($q) => $q->whereDate('fecha', '<=', $request->input('hasta')))
            ->when(
                $cajaPropia && ! $user->hasRole('super-admin'),
                fn ($q) => $q->whereHas('apertura', fn ($a) => $a->where('caja_id', $cajaPropia))
            )
            // Tesorería por sucursal: cada almacén ve los movimientos de sus cajas.
            ->whereHas('apertura.caja', fn ($c) => AlmacenAcceso::limitar($c));
    }

    public function store(Request $request)
    {
        $user = auth('api')->user();

        $data = $request->validate([
            'caja_id' => 'nullable|exists:cajas,id',
            'tipo' => 'required|in:ingreso,egreso',
            'motivo_movimiento_id' => 'required|exists:motivos_movimiento,id',
            'forma' => 'required|in:efectivo,transferencia,billetera',
            'cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'numero_operacion' => 'nullable|string|max:100',
            'monto' => 'required|numeric|min:0.01',
            'descripcion' => 'nullable|string|max:255',
            // El día en que pasó de verdad: cualquiera hasta hoy, nunca uno futuro. Sin indicar, hoy. El efectivo igual
            // entra en tu turno abierto; esta fecha es la que ven los reportes.
            'fecha' => 'nullable|date|before_or_equal:'.now()->toDateString(),
        ]);

        $cajaId = $data['caja_id'] ?? $user?->cajaActual()?->id;
        if (! $cajaId) {
            throw ValidationException::withMessages(['caja_id' => 'No tienes una caja asignada.']);
        }

        $caja = Caja::findOrFail($cajaId);
        AlmacenAcceso::exigir($caja->almacen_id);

        $apertura = AperturaCaja::where('caja_id', $cajaId)
            ->where('estado', 'abierta')
            ->latest('fecha_apertura')
            ->first();

        if (! $apertura) {
            throw ValidationException::withMessages(['caja_id' => 'La caja no tiene una apertura abierta.']);
        }

        // Una caja compartida la opera solo quien la abrió.
        if ($user && (int) $apertura->usuario_id !== (int) $user->id && ! AlmacenAcceso::irrestricto()) {
            $quien = $apertura->usuario?->name ?? 'otro usuario';
            throw ValidationException::withMessages(['caja_id' => "La caja está en uso: la tiene abierta {$quien}. Espera a que la cierre."]);
        }

        // El motivo debe corresponder al tipo (ingreso→entrada, egreso→salida).
        $motivo = MotivoMovimiento::findOrFail($data['motivo_movimiento_id']);
        $tipoMotivo = $data['tipo'] === 'ingreso' ? 'entrada' : 'salida';
        if ($motivo->tipo !== $tipoMotivo) {
            throw ValidationException::withMessages([
                'motivo_movimiento_id' => "El motivo \"{$motivo->nombre}\" no corresponde a un ".($data['tipo'] === 'ingreso' ? 'ingreso' : 'egreso').'.',
            ]);
        }
        // Los motivos del sistema (ventas, cobranzas, pagos) se generan automáticamente.
        if ($motivo->es_sistema) {
            throw ValidationException::withMessages([
                'motivo_movimiento_id' => "El motivo \"{$motivo->nombre}\" es del sistema y no se registra manualmente.",
            ]);
        }

        // Toda caja recibe efectivo y las cuentas y billeteras activas de la empresa.
        $cuentaId = null;
        $billeteraId = null;
        if ($data['forma'] === 'transferencia') {
            $cuentaId = $data['cuenta_bancaria_id'] ?? null;
            if (! $cuentaId || ! \App\Models\CuentaBancaria::whereKey($cuentaId)->where('activo', true)->exists()) {
                throw ValidationException::withMessages(['cuenta_bancaria_id' => 'Selecciona una cuenta bancaria activa.']);
            }
        } elseif ($data['forma'] === 'billetera') {
            $billeteraId = $data['billetera_id'] ?? null;
            if (! $billeteraId || ! \App\Models\BilleteraDigital::whereKey($billeteraId)->where('activo', true)->exists()) {
                throw ValidationException::withMessages(['billetera_id' => 'Selecciona una billetera activa.']);
            }
        }

        $movimiento = DB::transaction(function () use ($apertura, $data, $motivo, $cuentaId, $billeteraId) {
            return MovimientoCaja::create([
                'apertura_caja_id' => $apertura->id,
                'tipo' => $data['tipo'],
                'motivo_movimiento_id' => $motivo->id,
                'metodo_pago_id' => null,
                'cuenta_bancaria_id' => $cuentaId,
                'billetera_id' => $billeteraId,
                'numero_operacion' => $data['numero_operacion'] ?? null,
                'monto' => $data['monto'],
                'descripcion' => $data['descripcion'] ?? null,
                'fecha' => $data['fecha'] ?? now()->toDateString(),
            ]);
        });

        return response()->json($movimiento->load(self::WITH), 201);
    }
}
