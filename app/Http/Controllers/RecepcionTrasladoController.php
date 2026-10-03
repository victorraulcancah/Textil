<?php

namespace App\Http\Controllers;

use App\Models\Transferencia;
use App\Services\RecepcionTrasladoService;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;

/**
 * Recepcionar un traslado escaneando el QR de cada rollo (pistola o cámara). La hace el almacén destino; el origen
 * solo puede verlo.
 */
class RecepcionTrasladoController extends Controller
{
    public function __construct(private readonly RecepcionTrasladoService $servicio)
    {
    }

    public function show(Transferencia $transferencia)
    {
        if (! AlmacenAcceso::irrestricto()) {
            $propio = AlmacenAcceso::propio();
            if (! $propio || ! in_array($propio, [(int) $transferencia->almacen_origen_id, (int) $transferencia->almacen_destino_id], true)) {
                abort(403, 'Este traslado es de otros almacenes.');
            }
        }

        return response()->json($this->servicio->datos($transferencia));
    }

    public function escanear(Request $request, Transferencia $transferencia)
    {
        AlmacenAcceso::exigir($transferencia->almacen_destino_id);
        $codigo = $request->validate(['codigo' => 'required|string|max:100'])['codigo'];

        return response()->json($this->servicio->escanear($transferencia, $codigo));
    }

    public function quitar(Request $request, Transferencia $transferencia)
    {
        AlmacenAcceso::exigir($transferencia->almacen_destino_id);
        $rolloId = (int) $request->validate(['rollo_id' => 'required|integer'])['rollo_id'];

        return response()->json($this->servicio->quitar($transferencia, $rolloId));
    }

    public function confirmar(Request $request, Transferencia $transferencia)
    {
        AlmacenAcceso::exigir($transferencia->almacen_destino_id);
        $observacion = $request->validate(['observacion' => 'nullable|string|max:500'])['observacion'] ?? null;

        $this->servicio->confirmar($transferencia, $observacion);

        return response()->json($this->servicio->datos($transferencia->fresh()));
    }
}
