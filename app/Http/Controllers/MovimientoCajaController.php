<?php

namespace App\Http\Controllers;

use App\Models\AperturaCaja;
use App\Models\Caja;
use App\Models\MovimientoCaja;
use App\Models\MotivoMovimiento;
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
        'apertura.caja:id,nombre',
    ];

    public function index(Request $request)
    {
        $user = auth('api')->user();

        $query = MovimientoCaja::with(self::WITH)
            ->when($request->filled('caja_id'), fn ($q) => $q->whereHas('apertura', fn ($a) => $a->where('caja_id', $request->integer('caja_id'))))
            ->when(
                $user?->caja_id && ! $user->hasRole('super-admin'),
                fn ($q) => $q->whereHas('apertura', fn ($a) => $a->where('caja_id', $user->caja_id))
            )
            ->latest('fecha')
            ->latest('id')
            ->limit(500);

        return response()->json($query->get());
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
        ]);

        $cajaId = $data['caja_id'] ?? $user?->caja_id;
        if (! $cajaId) {
            throw ValidationException::withMessages(['caja_id' => 'No tienes una caja asignada.']);
        }

        $caja = Caja::with(['cuentasBancarias:id', 'billeteras:id'])->findOrFail($cajaId);

        $apertura = AperturaCaja::where('caja_id', $cajaId)
            ->where('estado', 'abierta')
            ->latest('fecha_apertura')
            ->first();

        if (! $apertura) {
            throw ValidationException::withMessages(['caja_id' => 'La caja no tiene una apertura abierta.']);
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

        // Validar la forma contra lo que la caja acepta.
        $cuentaId = null;
        $billeteraId = null;
        if ($data['forma'] === 'efectivo') {
            if (! $caja->acepta_efectivo) {
                throw ValidationException::withMessages(['forma' => 'Esta caja no acepta efectivo.']);
            }
        } elseif ($data['forma'] === 'transferencia') {
            $cuentaId = $data['cuenta_bancaria_id'] ?? null;
            if (! $cuentaId || ! $caja->cuentasBancarias->contains('id', $cuentaId)) {
                throw ValidationException::withMessages(['cuenta_bancaria_id' => 'Selecciona una cuenta bancaria habilitada para esta caja.']);
            }
        } else { // billetera
            $billeteraId = $data['billetera_id'] ?? null;
            if (! $billeteraId || ! $caja->billeteras->contains('id', $billeteraId)) {
                throw ValidationException::withMessages(['billetera_id' => 'Selecciona una billetera habilitada para esta caja.']);
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
                'fecha' => now()->toDateString(), // siempre la fecha actual
            ]);
        });

        return response()->json($movimiento->load(self::WITH), 201);
    }
}
