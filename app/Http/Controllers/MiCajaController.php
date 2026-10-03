<?php

namespace App\Http\Controllers;

use App\Models\AperturaCaja;
use App\Models\Caja;
use App\Models\CierreCaja;
use App\Models\MovimientoCaja;
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

        $caja = Caja::with([
            'cuentasBancarias:id,banco_id,alias,numero_cuenta,titular',
            'cuentasBancarias.banco:id,nombre',
            'billeteras:id,nombre,numero_asociado,titular',
        ])->find($cajaId);
        $apertura = AperturaCaja::where('caja_id', $cajaId)
            ->where('estado', 'abierta')
            ->latest('fecha_apertura')
            ->first();

        return response()->json([
            'caja' => $caja,
            'apertura' => $apertura,
            'resumen' => $apertura ? $this->resumen($apertura) : null,
            'movimientos' => $apertura ? $this->movimientos($apertura) : [],
        ]);
    }

    private function movimientos(AperturaCaja $apertura)
    {
        return MovimientoCaja::with([
            'motivo:id,nombre',
            'cuentaBancaria:id,alias,numero_cuenta',
            'billetera:id,nombre',
        ])
            ->where('apertura_caja_id', $apertura->id)
            ->latest('created_at')->latest('id')
            ->get();
    }

    public function abrir(Request $request)
    {
        $user = auth('api')->user();
        $cajaId = $user?->cajaActual()?->id;
        if (! $cajaId) {
            throw ValidationException::withMessages(['caja' => 'No tienes una caja asignada en este almacén.']);
        }

        $data = $request->validate(['monto_inicial' => 'required|numeric|min:0']);

        $abierta = AperturaCaja::where('caja_id', $cajaId)->where('estado', 'abierta')->exists();
        if ($abierta) {
            throw ValidationException::withMessages(['caja' => 'La caja ya está abierta.']);
        }

        AperturaCaja::create([
            'caja_id' => $cajaId,
            'usuario_id' => $user->id,
            'monto_inicial' => $data['monto_inicial'],
            'fecha_apertura' => now(),
            'estado' => 'abierta',
        ]);

        return $this->show();
    }

    public function cerrar(Request $request)
    {
        $user = auth('api')->user();
        $data = $request->validate([
            'monto_contado' => 'required|numeric|min:0',
            // Los dólares del cajón se cuentan aparte.
            'monto_contado_usd' => 'nullable|numeric|min:0',
        ]);

        $apertura = AperturaCaja::where('caja_id', $user?->cajaActual()?->id)
            ->where('estado', 'abierta')
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

        DB::transaction(function () use ($apertura, $sistema, $contado, $sistemaUsd, $contadoUsd) {
            CierreCaja::create([
                'apertura_caja_id' => $apertura->id,
                'monto_sistema' => $sistema,
                'monto_contado' => $contado,
                'diferencia' => round($contado - $sistema, 2),
                'monto_sistema_usd' => $sistemaUsd,
                'monto_contado_usd' => $contadoUsd,
                'diferencia_usd' => $sistemaUsd !== null && $contadoUsd !== null ? round($contadoUsd - $sistemaUsd, 2) : null,
                'fecha_cierre' => now(),
            ]);
            $apertura->update(['estado' => 'cerrada']);
        });

        return $this->show();
    }

    /** Resumen del efectivo esperado en la apertura. */
    /**
     * En la caja física solo hay billetes y monedas. Un cobro por Yape o
     * transferencia queda registrado como movimiento, pero el dinero entra al
     * banco, no al cajón: si se sumara al esperado, el arqueo saldría siempre
     * con faltante. Por eso `esperado` cuenta únicamente el efectivo, y lo
     * demás se informa aparte.
     */
    private function resumen(AperturaCaja $apertura): array
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
