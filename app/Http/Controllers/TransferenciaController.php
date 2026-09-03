<?php

namespace App\Http\Controllers;

use App\Models\Almacen;
use App\Models\ProductoPresentacion;
use App\Models\SerieDocumento;
use App\Models\Transferencia;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TransferenciaController extends Controller
{
    public function index()
    {
        return response()->json(
            Transferencia::with('almacenOrigen', 'almacenDestino')
                ->with(['usuarioEnvio:id,name', 'usuarioRecepcion:id,name', 'detalles.presentacion.producto.marca'])
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
                    'cantidad_enviada' => $detalle['cantidad_enviada'],
                ]);
            }

            return $transferencia;
        });

        return response()->json($transferencia->load(['almacenOrigen', 'almacenDestino', 'usuarioEnvio:id,name', 'detalles.presentacion.producto.marca']), 201);
    }

    public function show(Transferencia $transferencia)
    {
        return response()->json(
            $transferencia->load(['almacenOrigen', 'almacenDestino', 'usuarioEnvio:id,name', 'usuarioRecepcion:id,name', 'detalles.presentacion.producto.marca'])
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

    /** Enviar: descuenta el stock del almacén de origen y pasa a "en tránsito". */
    public function enviar(Transferencia $transferencia)
    {
        if ($transferencia->estado !== 'pendiente') {
            return response()->json(['message' => 'El traslado ya fue enviado o cancelado.'], 422);
        }

        try {
            DB::transaction(function () use ($transferencia) {
                $transferencia->loadMissing('detalles.presentacion');
                $origen = Almacen::findOrFail($transferencia->almacen_origen_id);
                $stock = app(StockService::class);

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
                    );
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
