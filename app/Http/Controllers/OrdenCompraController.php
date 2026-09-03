<?php

namespace App\Http\Controllers;

use App\Models\OrdenCompra;
use App\Models\SerieDocumento;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrdenCompraController extends Controller
{
    /** Serie del correlativo interno de órdenes de compra. */
    private const SERIE = 'OC0001';

    /**
     * Siguiente código interno (ej. OC0001-00000019). Se llama dentro de la
     * transacción para que el bloqueo evite correlativos duplicados.
     */
    private function generarCodigo(): string
    {
        $serieDoc = SerieDocumento::where('tipo_documento', 'orden_compra')
            ->where('serie', self::SERIE)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'orden_compra', 'serie' => self::SERIE],
                ['numero_actual' => 0, 'activo' => true]
            );

        $serieDoc->increment('numero_actual');

        return self::SERIE . '-' . str_pad($serieDoc->numero_actual, 8, '0', STR_PAD_LEFT);
    }

    public function index()
    {
        return response()->json(
            OrdenCompra::with([
                'proveedor:id,nombre',
                'compras:id,orden_compra_id,correlativo,fecha',
                // Detalle para la segunda tabla de la lista.
                'detalles.presentacion.producto.marca',
            ])
                ->withCount(['detalles', 'compras'])
                ->latest('id')
                ->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            // El código es interno: se genera solo si el cliente no manda uno.
            'codigo' => 'nullable|string|max:50|unique:ordenes_compra,codigo',
            'proveedor_id' => 'required|exists:proveedores,id',
            'fecha_emision' => 'required|date',
            'fecha_entrega_estimada' => 'nullable|date',
            'moneda' => 'nullable|string|max:10',
            'observaciones' => 'nullable|string',
            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.cantidad' => 'required|numeric|min:0.01',
            'detalles.*.precio_unitario' => 'required|numeric|min:0',
        ]);

        $orden = DB::transaction(function () use ($data) {
            $orden = OrdenCompra::create([
                'codigo' => $data['codigo'] ?? $this->generarCodigo(),
                'proveedor_id' => $data['proveedor_id'],
                'fecha_emision' => $data['fecha_emision'],
                'fecha_entrega_estimada' => $data['fecha_entrega_estimada'] ?? null,
                'moneda' => $data['moneda'] ?? 'PEN',
                'observaciones' => $data['observaciones'] ?? null,
                'estado' => 'pendiente',
                'usuario_crea_id' => auth()->id(),
            ]);

            $this->crearDetalles($orden, $data['detalles']);

            return $orden;
        });

        return response()->json($orden->load(['proveedor:id,nombre', 'detalles.presentacion.producto']), 201);
    }

    public function show(OrdenCompra $ordenesCompra)
    {
        return response()->json(
            $ordenesCompra->load(['proveedor:id,nombre', 'detalles.presentacion.producto'])
                ->loadCount('compras')
        );
    }

    /**
     * Edición de la orden. Si ya se transformó en compra queda bloqueada: cambiarla
     * dejaría la compra existente sin respaldo con lo que dice la orden.
     */
    public function update(Request $request, OrdenCompra $ordenesCompra)
    {
        if ($ordenesCompra->compras()->exists()) {
            return response()->json([
                'message' => 'La orden ya se transformó en compra y no se puede editar.',
            ], 422);
        }

        $data = $request->validate([
            'proveedor_id' => 'sometimes|required|exists:proveedores,id',
            'fecha_emision' => 'sometimes|required|date',
            'fecha_entrega_estimada' => 'nullable|date',
            'moneda' => 'nullable|string|max:10',
            'estado' => 'nullable|string|max:50',
            'observaciones' => 'nullable|string',
            'detalles' => 'sometimes|required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.cantidad' => 'required|numeric|min:0.01',
            'detalles.*.precio_unitario' => 'required|numeric|min:0',
        ]);

        DB::transaction(function () use ($data, $ordenesCompra) {
            $ordenesCompra->update(collect($data)->except('detalles')->all());

            // Las líneas se reemplazan completas: es más simple y evita huérfanos.
            if (array_key_exists('detalles', $data)) {
                $ordenesCompra->detalles()->delete();
                $this->crearDetalles($ordenesCompra, $data['detalles']);
            }
        });

        return response()->json(
            $ordenesCompra->fresh()->load(['proveedor:id,nombre', 'detalles.presentacion.producto'])
        );
    }

    public function destroy(OrdenCompra $ordenesCompra)
    {
        if ($ordenesCompra->compras()->exists()) {
            return response()->json([
                'message' => 'La orden ya se transformó en compra y no se puede eliminar.',
            ], 422);
        }

        $ordenesCompra->detalles()->delete();
        $ordenesCompra->delete();
        return response()->json(['message' => 'Eliminado']);
    }

    /** Crea las líneas calculando el subtotal de cada una. */
    private function crearDetalles(OrdenCompra $orden, array $detalles): void
    {
        foreach ($detalles as $detalle) {
            $cantidad = (float) $detalle['cantidad'];
            $precio = (float) $detalle['precio_unitario'];
            $orden->detalles()->create([
                'producto_presentacion_id' => $detalle['producto_presentacion_id'],
                'cantidad' => $cantidad,
                'precio_unitario' => $precio,
                'descuento' => 0,
                'subtotal' => round($cantidad * $precio, 2),
            ]);
        }
    }
}
