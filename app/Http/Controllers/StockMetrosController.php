<?php

namespace App\Http\Controllers;

use App\Models\Rollo;
use App\Services\StockMetrosService;
use App\Support\AlmacenAcceso;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Stock por metros: la tela suelta que se vende por corte sin escanear un QR. Aquí se ve el saldo por tela, color y
 * almacén, y se convierten metros de un rollo (con su QR) al saldo suelto.
 */
class StockMetrosController extends Controller
{
    public function __construct(private StockMetrosService $metros) {}

    /** Los saldos y las últimas conversiones (de un almacén: el del usuario, o el que elija quien ve todos). */
    public function index(Request $request): JsonResponse
    {
        $almacenId = AlmacenAcceso::irrestricto()
            ? ($request->filled('almacen_id') ? $request->integer('almacen_id') : null)
            : AlmacenAcceso::propio();

        $saldos = $this->metros->saldos($almacenId, $request->filled('producto_id') ? $request->integer('producto_id') : null)
            ->map(fn ($s) => [
                'id' => $s->id,
                'producto_id' => $s->producto_id,
                'producto' => $s->producto?->nombre,
                'producto_codigo' => $s->producto?->codigo,
                'producto_color_id' => $s->producto_color_id,
                'color' => $s->color?->nombre,
                'color_hex' => $s->color?->hex,
                'almacen_id' => $s->almacen_id,
                'almacen' => $s->almacen?->nombre,
                'metros' => (float) $s->metros,
                'reservado' => (float) $s->reservado,
                'disponible' => $s->disponible(),
            ])->values();

        $historial = $this->metros->historial($almacenId)->map(fn ($c) => [
            'id' => $c->id,
            'fecha' => $c->created_at,
            'rollo' => $c->rollo?->codigo,
            'producto' => $c->producto?->nombre,
            'color' => $c->color?->nombre,
            'almacen' => $c->almacen?->nombre,
            'metros' => (float) $c->metros,
            'metros_rollo_antes' => (float) $c->metros_rollo_antes,
            'metros_rollo_despues' => (float) $c->metros_rollo_despues,
            'usuario' => $c->usuario?->name,
            'observaciones' => $c->observaciones,
        ])->values();

        return response()->json(['saldos' => $saldos, 'historial' => $historial]);
    }

    /** Pasa metros de un rollo (por su código o QR) al stock por metros. Sin metros, se convierte el rollo entero. */
    public function convertir(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'codigo' => 'required|string|max:60',
            'metros' => 'nullable|numeric|min:0.01|max:99999',
            'observaciones' => 'nullable|string|max:255',
        ]);

        $rollo = Rollo::where('codigo', trim($datos['codigo']))->first(['id', 'almacen_id']);
        if ($rollo) {
            AlmacenAcceso::exigir($rollo->almacen_id);
        }

        $conversion = $this->metros->convertir(
            $datos['codigo'],
            isset($datos['metros']) ? (float) $datos['metros'] : null,
            $datos['observaciones'] ?? null,
        );

        return response()->json([
            'message' => "Se pasaron {$conversion->metros} m del rollo {$conversion->rollo?->codigo} al stock por metros.",
            'conversion' => [
                'id' => $conversion->id,
                'rollo' => $conversion->rollo?->codigo,
                'producto' => $conversion->producto?->nombre,
                'color' => $conversion->color?->nombre,
                'almacen' => $conversion->almacen?->nombre,
                'metros' => (float) $conversion->metros,
                'metros_rollo_despues' => (float) $conversion->metros_rollo_despues,
            ],
        ], 201);
    }
}
