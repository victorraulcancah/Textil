<?php

namespace App\Http\Controllers;

use App\Models\Almacen;
use App\Models\Prestamo;
use App\Models\PrestamoDevolucion;
use App\Models\ProductoPresentacion;
use App\Models\SerieDocumento;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PrestamoController extends Controller
{
    /** Relaciones que necesitan la lista y el detalle. */
    private const WITH = [
        'almacen:id,nombre',
        'usuario:id,name',
        'detalles.presentacion.producto.marca',
        'devoluciones.presentacion.producto',
        'devoluciones.usuario:id,name',
    ];

    public function index()
    {
        $prestamos = Prestamo::with(self::WITH)->latest()->get()
            ->map(fn (Prestamo $p) => $this->conSaldos($p));

        return response()->json($prestamos);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'almacen_id' => 'required|exists:almacenes,id',
            'tipo' => 'required|string|in:prestado,recibido',
            'tercero' => 'required|string|max:255',
            'tercero_documento' => 'nullable|string|max:15',
            'tercero_telefono' => 'nullable|string|max:20',
            'fecha_prestamo' => 'nullable|date',
            'fecha_devolucion_esperada' => 'nullable|date|after_or_equal:fecha_prestamo',
            'observaciones' => 'nullable|string',
            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.cantidad_prestada' => 'required|numeric|min:0.01',
        ]);

        $data['fecha_prestamo'] = $data['fecha_prestamo'] ?? now();
        $data['estado'] = 'prestado';
        $data['usuario_id'] = auth()->id();

        try {
            $prestamo = DB::transaction(function () use ($data) {
                $prestamo = Prestamo::create([
                    ...$data,
                    'serie' => Prestamo::SERIE,
                    'numero' => $this->siguienteNumero(),
                ]);
                $almacen = Almacen::findOrFail($data['almacen_id']);
                $stock = app(StockService::class);

                foreach ($data['detalles'] as $detalle) {
                    $presentacion = ProductoPresentacion::findOrFail($detalle['producto_presentacion_id']);
                    $cantidad = (float) $detalle['cantidad_prestada'];

                    $prestamo->detalles()->create([
                        'producto_presentacion_id' => $presentacion->id,
                        'cantidad_prestada' => $cantidad,
                    ]);

                    // "prestado" (yo presto) → sale stock; "recibido" (me prestan) → entra stock.
                    $args = [$presentacion, $almacen, $cantidad, 0, 'prestamo', 'prestamo', $prestamo->id, auth()->id()];
                    $data['tipo'] === 'prestado' ? $stock->salida(...$args) : $stock->entrada(...$args);
                }

                return $prestamo;
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($this->conSaldos($prestamo->load(self::WITH)), 201);
    }

    public function show(Prestamo $prestamo)
    {
        return response()->json($this->conSaldos($prestamo->load(self::WITH)));
    }

    public function update(Request $request, Prestamo $prestamo)
    {
        // Mientras no haya devoluciones se pueden corregir los datos del
        // tercero; después solo la fecha esperada y las observaciones.
        $reglas = [
            'fecha_devolucion_esperada' => 'nullable|date',
            'observaciones' => 'nullable|string',
        ];
        if (!$prestamo->devoluciones()->exists()) {
            $reglas += [
                'tercero' => 'sometimes|required|string|max:255',
                'tercero_documento' => 'nullable|string|max:15',
                'tercero_telefono' => 'nullable|string|max:20',
            ];
        }
        $prestamo->update($request->validate($reglas));

        return response()->json($this->conSaldos($prestamo->fresh(self::WITH)));
    }

    /**
     * Elimina el préstamo revirtiendo el stock que sigue pendiente de
     * devolver (lo ya devuelto ya volvió al almacén).
     */
    public function destroy(Prestamo $prestamo)
    {
        try {
            DB::transaction(function () use ($prestamo) {
                $almacen = $prestamo->almacen()->firstOrFail();
                $stock = app(StockService::class);

                foreach ($prestamo->detalles as $detalle) {
                    $pendiente = (float) $detalle->cantidad_prestada - $this->devueltoDe($prestamo, $detalle->producto_presentacion_id);
                    if ($pendiente <= 0 || !$detalle->presentacion) {
                        continue;
                    }
                    $args = [$detalle->presentacion, $almacen, $pendiente, 0, 'prestamo', 'prestamo', $prestamo->id, auth()->id()];
                    // Se deshace el movimiento original.
                    $prestamo->tipo === 'prestado' ? $stock->entrada(...$args) : $stock->salida(...$args);
                }

                $prestamo->delete();
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Eliminado']);
    }

    /**
     * Registra devoluciones (parciales o totales) y recalcula el estado.
     * Acepta un solo ítem (`producto_presentacion_id` + `cantidad`) o un
     * lote en `items[]`.
     */
    public function devolucion(Request $request, Prestamo $prestamo)
    {
        if ($request->has('items')) {
            $data = $request->validate([
                'items' => 'required|array|min:1',
                'items.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
                'items.*.cantidad' => 'required|numeric|min:0.01',
            ]);
            $items = $data['items'];
        } else {
            $items = [$request->validate([
                'producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
                'cantidad' => 'required|numeric|min:0.01',
            ])];
        }

        // Validación previa de todo el lote: o entra todo o nada.
        foreach ($items as $item) {
            $detalle = $prestamo->detalles()
                ->where('producto_presentacion_id', $item['producto_presentacion_id'])
                ->first();
            if (!$detalle) {
                return response()->json(['message' => 'Uno de los productos no pertenece a este préstamo.'], 422);
            }
            $devuelto = $this->devueltoDe($prestamo, $item['producto_presentacion_id']);
            if ($devuelto + (float) $item['cantidad'] > (float) $detalle->cantidad_prestada + 0.0001) {
                $nombre = $detalle->presentacion?->producto?->nombre ?? 'un producto';
                return response()->json([
                    'message' => "La cantidad devuelta de {$nombre} supera lo pendiente (" . number_format((float) $detalle->cantidad_prestada - $devuelto, 2) . ').',
                ], 422);
            }
        }

        try {
            DB::transaction(function () use ($prestamo, $items) {
                $almacen = $prestamo->almacen()->firstOrFail();
                $stock = app(StockService::class);

                foreach ($items as $item) {
                    $presentacion = ProductoPresentacion::findOrFail($item['producto_presentacion_id']);
                    $cantidad = (float) $item['cantidad'];

                    PrestamoDevolucion::create([
                        'prestamo_id' => $prestamo->id,
                        'producto_presentacion_id' => $presentacion->id,
                        'cantidad' => $cantidad,
                        'fecha' => now(),
                        'usuario_id' => auth()->id(),
                    ]);

                    // Devolución de un "prestado" (me devuelven) → entra stock;
                    // de un "recibido" (yo devuelvo) → sale stock.
                    $args = [$presentacion, $almacen, $cantidad, 0, 'prestamo', 'prestamo', $prestamo->id, auth()->id()];
                    $prestamo->tipo === 'prestado' ? $stock->entrada(...$args) : $stock->salida(...$args);
                }

                $prestamo->estado = $this->calcularEstado($prestamo);
                $prestamo->fecha_devolucion = $prestamo->estado === 'devuelto' ? now() : null;
                $prestamo->save();
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($this->conSaldos($prestamo->fresh(self::WITH)));
    }

    /** Correlativo formal del préstamo, ej. PR01-0012. */
    private function siguienteNumero(): string
    {
        $serieDoc = SerieDocumento::where('tipo_documento', 'prestamo')
            ->where('serie', Prestamo::SERIE)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'prestamo', 'serie' => Prestamo::SERIE],
                ['numero_actual' => 0, 'activo' => true]
            );
        $serieDoc->increment('numero_actual');

        return str_pad($serieDoc->numero_actual, 4, '0', STR_PAD_LEFT);
    }

    private function devueltoDe(Prestamo $prestamo, int $presentacionId): float
    {
        return (float) $prestamo->devoluciones()
            ->where('producto_presentacion_id', $presentacionId)
            ->sum('cantidad');
    }

    /**
     * Agrega a cada detalle lo devuelto y lo pendiente para que la lista no
     * tenga que sumar devoluciones.
     */
    private function conSaldos(Prestamo $prestamo): Prestamo
    {
        $devueltos = $prestamo->devoluciones->groupBy('producto_presentacion_id')
            ->map(fn ($grupo) => (float) $grupo->sum('cantidad'));

        foreach ($prestamo->detalles as $detalle) {
            $devuelto = $devueltos[$detalle->producto_presentacion_id] ?? 0.0;
            $detalle->setAttribute('cantidad_devuelta', round($devuelto, 2));
            $detalle->setAttribute('cantidad_pendiente', round(max(0, (float) $detalle->cantidad_prestada - $devuelto), 2));
        }

        return $prestamo;
    }

    /**
     * Estado calculado: prestado (nada devuelto), parcial (algo devuelto) o devuelto (todo devuelto).
     */
    private function calcularEstado(Prestamo $prestamo): string
    {
        $pendiente = false;
        foreach ($prestamo->detalles as $detalle) {
            if ($this->devueltoDe($prestamo, $detalle->producto_presentacion_id) < (float) $detalle->cantidad_prestada - 0.0001) {
                $pendiente = true;
            }
        }

        if (!$pendiente) {
            return 'devuelto';
        }

        return $prestamo->devoluciones()->exists() ? 'parcial' : 'prestado';
    }
}
