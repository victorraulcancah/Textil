<?php

namespace App\Http\Controllers;

use App\Models\OrdenCompra;
use App\Models\Proveedor;
use App\Models\SerieDocumento;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrdenCompraController extends Controller
{
    /** Serie del correlativo interno de respaldo, para proveedores sin código corto. */
    private const SERIE = 'OC0001';

    /** Campos que solo tienen sentido en una compra al exterior. */
    private const CAMPOS_EXTERIOR = [
        'cargo_type', 'medio_transporte', 'incoterm', 'pais_origen', 'pais_destino',
        'puerto_embarque', 'puerto_destino', 'numero_contenedor',
        'fecha_embarque_estimada', 'elaborado_por', 'aprobado_por',
    ];

    /**
     * Código de la orden.
     *
     * Si el proveedor tiene código corto (KET), se usa su propia numeración:
     * KET-001-26 — código del proveedor, correlativo de 3 dígitos por
     * proveedor (no se reinicia cada año, así que a los 999 pasa a 4 dígitos
     * sin romper nada) y los dos últimos dígitos del año de emisión.
     *
     * Sin código corto se usa el correlativo interno de siempre
     * (OC0001-00000019), para no obligar a configurar nada de entrada.
     */
    private function generarCodigo(Proveedor $proveedor, string $fechaEmision): string
    {
        if ($proveedor->codigo_corto) {
            return $this->generarCodigoProveedor($proveedor, $fechaEmision);
        }

        $serieDoc = SerieDocumento::where('tipo_documento', 'orden_compra')
            ->where('serie', self::SERIE)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'orden_compra', 'serie' => self::SERIE],
                ['numero_actual' => 0, 'activo' => true]
            );

        // El contador puede ir por detrás de los códigos que ya existen: los
        // datos de ejemplo y los códigos escritos a mano no lo tocan. Se salta
        // los usados en vez de chocar contra la clave única.
        do {
            $serieDoc->increment('numero_actual');
            $codigo = self::SERIE . '-' . str_pad($serieDoc->numero_actual, 8, '0', STR_PAD_LEFT);
        } while (OrdenCompra::where('codigo', $codigo)->exists());

        return $codigo;
    }

    private function generarCodigoProveedor(Proveedor $proveedor, string $fechaEmision): string
    {
        $serie = 'PROV' . $proveedor->id;

        $serieDoc = SerieDocumento::where('tipo_documento', 'orden_compra_proveedor')
            ->where('serie', $serie)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'orden_compra_proveedor', 'serie' => $serie],
                ['numero_actual' => 0, 'activo' => true]
            );

        $anio = substr(date('y', strtotime($fechaEmision)), -2);

        do {
            $serieDoc->increment('numero_actual');
            $codigo = sprintf('%s-%03d-%s', $proveedor->codigo_corto, $serieDoc->numero_actual, $anio);
        } while (OrdenCompra::where('codigo', $codigo)->exists());

        return $codigo;
    }

    public function index()
    {
        return response()->json(
            OrdenCompra::with([
                'proveedor:id,nombre,codigo_corto',
                'compras:id,orden_compra_id,correlativo,fecha',
                'usuarioAprueba:id,name',
                'usuarioEnvia:id,name',
                // Detalle para la segunda tabla de la lista.
                'detalles.presentacion.producto.marca',
                'detalles.color:id,nombre,codigo,hex',
            ])
                ->withCount(['detalles', 'compras'])
                ->latest('id')
                ->get()
        );
    }

    private function reglas(): array
    {
        return [
            'tipo' => 'required|in:nacional,exterior',
            'proveedor_id' => 'required|exists:proveedores,id',
            'fecha_emision' => 'required|date',
            'fecha_entrega_estimada' => 'nullable|date',
            'moneda' => 'nullable|string|max:10|in:PEN,USD',
            'observaciones' => 'nullable|string',

            // Solo se piden si tipo = exterior; una orden nacional los ignora.
            'cargo_type' => 'nullable|string|max:20',
            'medio_transporte' => 'nullable|string|max:20',
            'incoterm' => 'nullable|string|max:20',
            'pais_origen' => 'nullable|string|max:100',
            'pais_destino' => 'nullable|string|max:100',
            'puerto_embarque' => 'nullable|string|max:100',
            'puerto_destino' => 'nullable|string|max:100',
            'numero_contenedor' => 'nullable|string|max:50',
            'fecha_embarque_estimada' => 'nullable|date',
            'elaborado_por' => 'nullable|string|max:150',
            'aprobado_por' => 'nullable|string|max:150',

            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.producto_color_id' => 'nullable|exists:producto_colores,id',
            'detalles.*.rollos' => 'nullable|integer|min:0',
            'detalles.*.cantidad' => 'required|numeric|min:0.01',
            'detalles.*.precio_unitario' => 'required|numeric|min:0',
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->reglas());

        $orden = DB::transaction(function () use ($data) {
            $proveedor = Proveedor::findOrFail($data['proveedor_id']);

            $camposExterior = $data['tipo'] === 'exterior'
                ? array_intersect_key($data, array_flip(self::CAMPOS_EXTERIOR))
                : [];

            $orden = OrdenCompra::create(array_merge([
                'codigo' => $this->generarCodigo($proveedor, $data['fecha_emision']),
                'tipo' => $data['tipo'],
                'proveedor_id' => $data['proveedor_id'],
                'fecha_emision' => $data['fecha_emision'],
                'fecha_entrega_estimada' => $data['fecha_entrega_estimada'] ?? null,
                'moneda' => $data['moneda'] ?? ($data['tipo'] === 'exterior' ? 'USD' : 'PEN'),
                'observaciones' => $data['observaciones'] ?? null,
                'estado' => 'pendiente',
                'usuario_crea_id' => auth()->id(),
            ], $camposExterior));

            $this->crearDetalles($orden, $data['detalles']);

            return $orden;
        });

        return response()->json($orden->load(['proveedor:id,nombre,codigo_corto', 'detalles.presentacion.producto', 'detalles.color']), 201);
    }

    public function show(OrdenCompra $ordenesCompra)
    {
        return response()->json(
            $ordenesCompra->load(['proveedor', 'usuarioCrea:id,name', 'usuarioAprueba:id,name', 'usuarioEnvia:id,name', 'detalles.presentacion.producto', 'detalles.color'])
                ->loadCount('compras')
        );
    }

    /**
     * Aprueba la orden: de pendiente pasa a aprobada, dejando quién y cuándo.
     * Es un paso formal antes de enviarla al proveedor.
     */
    public function aprobar(OrdenCompra $ordenesCompra)
    {
        if ($ordenesCompra->estado !== 'pendiente') {
            return response()->json([
                'message' => 'Solo se puede aprobar una orden que está pendiente.',
            ], 422);
        }

        $ordenesCompra->update([
            'estado' => 'aprobada',
            'usuario_aprueba_id' => auth()->id(),
            'fecha_aprobacion' => now(),
        ]);

        return response()->json(
            $ordenesCompra->fresh()->load(['proveedor', 'usuarioAprueba:id,name', 'usuarioEnvia:id,name'])
        );
    }

    /** Marca la orden ya aprobada como enviada al proveedor. */
    public function enviar(OrdenCompra $ordenesCompra)
    {
        if ($ordenesCompra->estado !== 'aprobada') {
            return response()->json([
                'message' => 'Solo se puede enviar una orden que ya está aprobada.',
            ], 422);
        }

        $ordenesCompra->update([
            'estado' => 'enviada',
            'usuario_envia_id' => auth()->id(),
            'fecha_envio' => now(),
        ]);

        return response()->json(
            $ordenesCompra->fresh()->load(['proveedor', 'usuarioAprueba:id,name', 'usuarioEnvia:id,name'])
        );
    }

    /**
     * Edición de la orden. Bloqueada si ya se transformó en compra (dejaría la
     * compra existente sin respaldo) o si ya salió de "pendiente": aprobarla es
     * un compromiso formal, cambiarla después invalidaría esa aprobación.
     */
    public function update(Request $request, OrdenCompra $ordenesCompra)
    {
        if ($ordenesCompra->compras()->exists()) {
            return response()->json([
                'message' => 'La orden ya se transformó en compra y no se puede editar.',
            ], 422);
        }

        if ($ordenesCompra->estado !== 'pendiente') {
            return response()->json([
                'message' => 'La orden ya fue aprobada y no se puede editar.',
            ], 422);
        }

        $data = $request->validate([
            'tipo' => 'sometimes|required|in:nacional,exterior',
            'proveedor_id' => 'sometimes|required|exists:proveedores,id',
            'fecha_emision' => 'sometimes|required|date',
            'fecha_entrega_estimada' => 'nullable|date',
            'moneda' => 'nullable|string|max:10|in:PEN,USD',
            'estado' => 'nullable|string|max:50',
            'observaciones' => 'nullable|string',

            'cargo_type' => 'nullable|string|max:20',
            'medio_transporte' => 'nullable|string|max:20',
            'incoterm' => 'nullable|string|max:20',
            'pais_origen' => 'nullable|string|max:100',
            'pais_destino' => 'nullable|string|max:100',
            'puerto_embarque' => 'nullable|string|max:100',
            'puerto_destino' => 'nullable|string|max:100',
            'numero_contenedor' => 'nullable|string|max:50',
            'fecha_embarque_estimada' => 'nullable|date',
            'elaborado_por' => 'nullable|string|max:150',
            'aprobado_por' => 'nullable|string|max:150',

            'detalles' => 'sometimes|required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.producto_color_id' => 'nullable|exists:producto_colores,id',
            'detalles.*.rollos' => 'nullable|integer|min:0',
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
            $ordenesCompra->fresh()->load(['proveedor', 'detalles.presentacion.producto', 'detalles.color'])
        );
    }

    public function destroy(OrdenCompra $ordenesCompra)
    {
        if ($ordenesCompra->compras()->exists()) {
            return response()->json([
                'message' => 'La orden ya se transformó en compra y no se puede eliminar.',
            ], 422);
        }

        if ($ordenesCompra->estado !== 'pendiente') {
            return response()->json([
                'message' => 'La orden ya fue aprobada y no se puede eliminar.',
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
                'producto_color_id' => $detalle['producto_color_id'] ?? null,
                'rollos' => $detalle['rollos'] ?? null,
                'cantidad' => $cantidad,
                'precio_unitario' => $precio,
                'descuento' => 0,
                'subtotal' => round($cantidad * $precio, 2),
            ]);
        }
    }
}
