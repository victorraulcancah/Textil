<?php

namespace App\Http\Controllers;

use App\Models\TipoCambio;
use App\Services\TipoCambioService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class TipoCambioController extends Controller
{
    public function __construct(protected TipoCambioService $tiposCambio) {}

    /**
     * El que vale para una fecha (hoy si no se dice): SUNAT y comercial, cada
     * uno con el día del que sale. Lo usan la venta y los cobros, por eso no
     * pide permiso (ruta "tipo-cambio", fuera de las protegidas).
     */
    public function dia(Request $request)
    {
        $request->validate(['fecha' => 'nullable|date']);

        return response()->json($this->tiposCambio->para($request->input('fecha')));
    }

    /** Los días de un mes (el actual si no se dice), del más reciente al más antiguo. */
    public function index(Request $request)
    {
        $request->validate(['mes' => 'nullable|date_format:Y-m']);

        // Al abrir la pantalla, el de hoy ya debería estar.
        $this->tiposCambio->traerDeSunat();

        $mes = Carbon::createFromFormat('Y-m', $request->input('mes', now()->format('Y-m')))->startOfMonth();

        return response()->json(
            TipoCambio::whereBetween('fecha', [$mes->toDateString(), $mes->copy()->endOfMonth()->toDateString()])
                ->orderByDesc('fecha')
                ->get(),
        );
    }

    /**
     * Pone el comercial de un día y, si SUNAT no respondió, también su compra
     * y venta a mano.
     */
    public function guardar(Request $request)
    {
        $data = $request->validate([
            'fecha' => 'required|date',
            'comercial' => 'nullable|numeric|min:0.0001|max:99',
            'venta' => 'nullable|numeric|min:0.0001|max:99',
            'compra' => 'nullable|numeric|min:0.0001|max:99',
        ]);

        $fecha = Carbon::parse($data['fecha'])->toDateString();
        $tipo = TipoCambio::firstOrNew(['fecha' => $fecha]);
        $tipo->fill(collect($data)->only(['comercial', 'venta', 'compra'])->filter(fn ($v) => $v !== null)->all());
        if (array_key_exists('comercial', $data) && $data['comercial'] === null) {
            $tipo->comercial = null;
        }
        $tipo->save();

        return response()->json($tipo->fresh());
    }

    /** Vuelve a pedir a SUNAT el de hoy (si ya estaba, se actualiza). */
    public function sunat()
    {
        if (! $this->tiposCambio->traerDeSunat(forzar: true)) {
            return response()->json(['message' => 'SUNAT no respondió o todavía no publica el de hoy. Inténtalo más tarde o ponlo a mano.'], 422);
        }

        return response()->json($this->tiposCambio->para());
    }
}
