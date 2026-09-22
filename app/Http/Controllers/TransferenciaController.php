<?php

namespace App\Http\Controllers;

use App\Models\Almacen;
use App\Models\ProductoPresentacion;
use App\Models\Rollo;
use App\Models\SerieDocumento;
use App\Models\Transferencia;
use App\Services\RolloService;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TransferenciaController extends Controller
{
    public function index()
    {
        return response()->json(
            Transferencia::with('almacenOrigen', 'almacenDestino')
                ->with(['usuarioEnvio:id,name', 'usuarioRecepcion:id,name', 'detalles.presentacion.producto.marca', 'detalles.color'])
                ->withCount('detalles')
                ->latest('id')
                ->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'almacen_origen_id' => 'required|exists:almacenes,id',
            'almacen_destino_id' => 'required|exists:almacenes,id|different:almacen_origen_id',
            'motivo_traslado' => 'nullable|string|exists:motivos_traslado,codigo',
            'fecha_inicio_traslado' => 'nullable|date',
            'modalidad_transporte' => 'nullable|in:privado,publico',
            // Transporte publico exige transportista; el privado, vehiculo y conductor.
            'transportista_razon_social' => 'nullable|required_if:modalidad_transporte,publico|string|max:255',
            'transportista_ruc' => 'nullable|required_if:modalidad_transporte,publico|digits:11',
            'vehiculo_placa' => 'nullable|string|max:10',
            'conductor_nombre' => 'nullable|string|max:255',
            'conductor_documento' => 'nullable|string|max:15',
            'conductor_licencia' => 'nullable|string|max:15',
            'numero_bultos' => 'nullable|integer|min:0',
            'peso_bruto_kg' => 'nullable|numeric|min:0',
            'observaciones' => 'nullable|string',
            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            // Cuál color viaja; solo aplica a lo que se lleva por rollos.
            'detalles.*.producto_color_id' => 'nullable|exists:producto_colores,id',
            'detalles.*.cantidad_enviada' => 'required|numeric|min:0.01',
        ]);

        $transferencia = DB::transaction(function () use ($data) {
            $transferencia = Transferencia::create([
                'serie' => Transferencia::SERIE,
                'numero' => $this->siguienteNumero(),
                'almacen_origen_id' => $data['almacen_origen_id'],
                'almacen_destino_id' => $data['almacen_destino_id'],
                'motivo_traslado' => $data['motivo_traslado'] ?? 'traslado_entre_establecimientos',
                'fecha_inicio_traslado' => $data['fecha_inicio_traslado'] ?? now()->toDateString(),
                'modalidad_transporte' => $data['modalidad_transporte'] ?? 'privado',
                'transportista_razon_social' => $data['transportista_razon_social'] ?? null,
                'transportista_ruc' => $data['transportista_ruc'] ?? null,
                'vehiculo_placa' => $data['vehiculo_placa'] ?? null,
                'conductor_nombre' => $data['conductor_nombre'] ?? null,
                'conductor_documento' => $data['conductor_documento'] ?? null,
                'conductor_licencia' => $data['conductor_licencia'] ?? null,
                'numero_bultos' => $data['numero_bultos'] ?? null,
                'peso_bruto_kg' => $data['peso_bruto_kg'] ?? null,
                'observaciones' => $data['observaciones'] ?? null,
                'estado' => 'pendiente',
                'usuario_envio_id' => auth()->id(),
            ]);

            foreach ($data['detalles'] as $detalle) {
                $transferencia->detalles()->create([
                    'producto_presentacion_id' => $detalle['producto_presentacion_id'],
                    'producto_color_id' => $detalle['producto_color_id'] ?? null,
                    'cantidad_enviada' => $detalle['cantidad_enviada'],
                ]);
            }

            return $transferencia;
        });

        return response()->json($transferencia->load(['almacenOrigen', 'almacenDestino', 'usuarioEnvio:id,name', 'detalles.presentacion.producto.marca', 'detalles.color']), 201);
    }

    public function show(Transferencia $transferencia)
    {
        return response()->json(
            $transferencia->load(['almacenOrigen', 'almacenDestino', 'usuarioEnvio:id,name', 'usuarioRecepcion:id,name', 'detalles.presentacion.producto.marca', 'detalles.color'])
        );
    }

    /** Los datos del transporte se pueden completar hasta que se envia. */
    public function update(Request $request, Transferencia $transferencia)
    {
        $reglas = ['observaciones' => 'nullable|string'];
        if ($transferencia->estado === 'pendiente') {
            $reglas += [
                'motivo_traslado' => 'nullable|string|exists:motivos_traslado,codigo',
                'fecha_inicio_traslado' => 'nullable|date',
                'modalidad_transporte' => 'nullable|in:privado,publico',
                'transportista_razon_social' => 'nullable|string|max:255',
                'transportista_ruc' => 'nullable|digits:11',
                'vehiculo_placa' => 'nullable|string|max:10',
                'conductor_nombre' => 'nullable|string|max:255',
                'conductor_documento' => 'nullable|string|max:15',
                'conductor_licencia' => 'nullable|string|max:15',
                'numero_bultos' => 'nullable|integer|min:0',
                'peso_bruto_kg' => 'nullable|numeric|min:0',
            ];
        }
        $transferencia->update($request->validate($reglas));
        return response()->json($transferencia->fresh());
    }

    /** Correlativo formal de la guia, ej. T001-00000012. */
    private function siguienteNumero(): string
    {
        $serieDoc = SerieDocumento::where('tipo_documento', 'guia_traslado')
            ->where('serie', Transferencia::SERIE)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'guia_traslado', 'serie' => Transferencia::SERIE],
                ['numero_actual' => 0, 'activo' => true]
            );
        $serieDoc->increment('numero_actual');

        return str_pad($serieDoc->numero_actual, 8, '0', STR_PAD_LEFT);
    }

    public function destroy(Transferencia $transferencia)
    {
        if ($transferencia->estado !== 'pendiente') {
            return response()->json(['message' => 'Solo se pueden eliminar traslados pendientes.'], 422);
        }
        $transferencia->delete();
        return response()->json(['message' => 'Eliminado']);
    }

    /**
     * Aprueba la solicitud: descuenta el stock del almacén de origen y pasa
     * a "en tránsito". Aprobar y enviar son el mismo paso: quien autoriza el
     * traslado es quien lo despacha, no hace falta un clic aparte.
     *
     * Lo que se lleva por rollos no es solo un número: los rollos mismos
     * cambian de almacén (o se parten, si lo pedido no coincide con rollos
     * completos), para que no queden contados en un lado y físicamente en
     * el otro.
     */
    public function aprobar(Transferencia $transferencia)
    {
        if ($transferencia->estado !== 'pendiente') {
            return response()->json(['message' => 'Solo se puede aprobar una solicitud pendiente.'], 422);
        }

        try {
            DB::transaction(function () use ($transferencia) {
                $transferencia->loadMissing('detalles.presentacion.producto');
                $origen = Almacen::findOrFail($transferencia->almacen_origen_id);
                $stock = app(StockService::class);
                $rollos = app(RolloService::class);

                foreach ($transferencia->detalles as $detalle) {
                    if (! $detalle->presentacion) {
                        continue;
                    }

                    $stock->salida(
                        $detalle->presentacion,
                        $origen,
                        (float) $detalle->cantidad_enviada,
                        0,
                        'transferencia',
                        'transferencia',
                        $transferencia->id,
                        auth()->id(),
                        colorId: $detalle->producto_color_id,
                    );

                    $this->moverRollos($rollos, $detalle, $origen->id, $transferencia->almacen_destino_id);
                }

                $transferencia->update([
                    'estado' => 'en_transito',
                    'fecha_envio' => now(),
                    'usuario_envio_id' => auth()->id(),
                ]);
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($transferencia->fresh());
    }

    /**
     * Rechaza la solicitud: no se toca el stock, queda cerrada con el motivo
     * de quien la revisó. A diferencia de anular (el propio creador se
     * arrepiente), esto lo hace quien la evalúa y la descarta.
     */
    public function rechazar(Request $request, Transferencia $transferencia)
    {
        if ($transferencia->estado !== 'pendiente') {
            return response()->json(['message' => 'Solo se puede rechazar una solicitud pendiente.'], 422);
        }

        $data = $request->validate(['motivo' => 'nullable|string|max:500']);

        $transferencia->update([
            'estado' => 'rechazada',
            'motivo_rechazo' => $data['motivo'] ?? null,
        ]);

        return response()->json($transferencia->fresh());
    }

    /**
     * Mueve al almacén destino los rollos que cubren la cantidad enviada.
     *
     * Los toma del más antiguo al más nuevo. Si sobran metros del último
     * rollo, se parte: el trozo enviado viaja, el resto se queda donde
     * estaba. Un producto que no se maneja por rollos (no tiene ninguno en
     * este almacén) no tiene nada que mover aquí: ya lo cubrió el stock.
     */
    private function moverRollos(RolloService $rollos, $detalle, int $almacenOrigenId, int $almacenDestinoId): void
    {
        $factor = (float) ($detalle->presentacion->factor_conversion ?: 1);
        $basePorMetro = max((float) ($detalle->presentacion->producto?->factorBasePorMetro() ?? 1), 0.0001);
        $metrosPorMover = round((float) $detalle->cantidad_enviada * $factor / $basePorMetro, 2);

        // Si esta tela no maneja rollos en absoluto (mercería, insumos), no
        // hay nada que mover aquí: ya lo cubrió el stock de arriba.
        $usaRollos = Rollo::where('producto_id', $detalle->presentacion->producto_id)->exists();
        if (! $usaRollos) {
            return;
        }

        $candidatos = Rollo::disponibles()
            ->where('producto_id', $detalle->presentacion->producto_id)
            ->where('almacen_id', $almacenOrigenId)
            ->where('producto_color_id', $detalle->producto_color_id)
            ->orderBy('numero')
            ->get();

        foreach ($candidatos as $rollo) {
            if ($metrosPorMover <= 0.001) {
                break;
            }

            $metrosRollo = (float) $rollo->metros_actual;

            if ($metrosRollo <= $metrosPorMover + 0.001) {
                $rollos->trasladar($rollo, ['almacen_id' => $almacenDestinoId], auth()->id());
                $metrosPorMover = round($metrosPorMover - $metrosRollo, 2);
            } else {
                $rollos->dividir($rollo, $metrosPorMover, $almacenDestinoId, auth()->id());
                $metrosPorMover = 0;
            }
        }

        if ($metrosPorMover > 0.001) {
            $color = $detalle->producto_color_id ? ' de ese color' : '';
            throw new \RuntimeException(
                "No hay rollos{$color} suficientes de \"{$detalle->presentacion->producto?->nombre}\" en el almacén de origen "
                ."para cubrir {$detalle->cantidad_enviada} {$detalle->presentacion->nombre}."
            );
        }
    }

    /** Recibir: ingresa el stock al almacén de destino y pasa a "recibida". */
    public function recibir(Transferencia $transferencia)
    {
        if ($transferencia->estado !== 'en_transito') {
            return response()->json(['message' => 'Solo se pueden recibir traslados en tránsito.'], 422);
        }

        DB::transaction(function () use ($transferencia) {
            $transferencia->loadMissing('detalles.presentacion');
            $destino = Almacen::findOrFail($transferencia->almacen_destino_id);
            $stock = app(StockService::class);

            foreach ($transferencia->detalles as $detalle) {
                if (! $detalle->presentacion) {
                    continue;
                }
                $cantidad = (float) $detalle->cantidad_enviada;
                $detalle->update(['cantidad_recibida' => $cantidad]);
                $stock->entrada(
                    $detalle->presentacion,
                    $destino,
                    $cantidad,
                    0,
                    'transferencia',
                    'transferencia',
                    $transferencia->id,
                    auth()->id(),
                    colorId: $detalle->producto_color_id,
                );
            }

            $transferencia->update([
                'estado' => 'recibida',
                'fecha_recepcion' => now(),
                'usuario_recepcion_id' => auth()->id(),
            ]);
        });

        return response()->json($transferencia->fresh());
    }

    /** Anular un traslado pendiente (aún no envía stock). */
    public function anular(Transferencia $transferencia)
    {
        if ($transferencia->estado !== 'pendiente') {
            return response()->json(['message' => 'Solo se pueden anular traslados pendientes.'], 422);
        }
        $transferencia->update(['estado' => 'cancelada']);
        return response()->json($transferencia->fresh());
    }
}
