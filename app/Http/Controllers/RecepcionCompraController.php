<?php

namespace App\Http\Controllers;

use App\Models\Almacen;
use App\Models\Compra;
use App\Models\Importacion;
use App\Models\ProductoColor;
use App\Models\PackingListRollo;
use App\Models\ProductoPresentacion;
use App\Models\RecepcionCompra;
use App\Models\Rollo;
use App\Models\SerieDocumento;
use App\Services\RolloService;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RecepcionCompraController extends Controller
{
    private const RELACIONES = [
        'proveedor:id,nombre',
        'almacen:id,nombre',
        'compra:id,correlativo,estado,finalizado,motivo_finalizacion,fecha_finalizacion',
        'ordenCompra:id,codigo',
        'usuarioRecibe:id,name',
        'detalles.presentacion.producto.marca',
        'detalles.compraDetalle:id,cantidad,cantidad_finalizada',
    ];

    public function index()
    {
        return response()->json(
            RecepcionCompra::with(self::RELACIONES)->withCount('detalles')->latest('id')->get()
        );
    }

    /**
     * Estado de recepción de una compra: cuánto se pidió y cuánto lleva recibido
     * cada línea. Alimenta el modal de "Recepcionar".
     */
    public function pendientesDeCompra(Compra $compra)
    {
        $compra->load([
            'detalles.presentacion.producto.marca',
            'detalles.presentacion.producto.colores',
            'detalles.color:id,nombre,codigo',
            'proveedor:id,nombre',
            'ordenCompra:id,codigo',
        ]);

        $pendientes = $compra->pendientePorLinea();
        $recibidos = $compra->recibidoPorLinea();

        $lineas = $compra->detalles->map(fn ($d) => [
            'compra_detalle_id' => $d->id,
            'producto_presentacion_id' => $d->producto_presentacion_id,
            'producto_id' => $d->presentacion?->producto?->id,
            'producto' => $d->presentacion?->producto?->nombre,
            // Si la tela tiene muestrario, la recepción pide los rollos color
            // por color: es como viene el packing list.
            'colores' => $d->presentacion?->producto?->colores
                ->map(fn ($c) => ['id' => $c->id, 'nombre' => $c->nombre, 'codigo' => $c->codigo])
                ->values(),
            'codigo' => $d->presentacion?->producto?->codigo,
            'marca' => $d->presentacion?->producto?->marca?->nombre,
            'unidad' => $d->presentacion?->nombre,
            // Lo que la compra ya dice de esta línea: la recepción lo muestra en
            // vez de volver a pedirlo (el color con el que se compró, cuántos
            // rollos se pidieron).
            'color_id' => $d->producto_color_id,
            'color' => $d->color
                ? ['id' => $d->color->id, 'nombre' => $d->color->nombre, 'codigo' => $d->color->codigo]
                : null,
            'rollos' => $d->rollos ? (int) $d->rollos : null,
            'costo_unitario' => (float) $d->costo_unitario,
            'cantidad_pedida' => (float) $d->cantidad,
            'cantidad_recibida' => $recibidos[$d->id] ?? 0,
            'cantidad_finalizada' => (float) $d->cantidad_finalizada,
            'pendiente' => $pendientes[$d->id] ?? 0,
        ]);

        return response()->json([
            'compra' => [
                'id' => $compra->id,
                'numero_compra' => $compra->numero_compra,
                // La orden con la que se pidió (KET-001-26): así el almacén
                // reconoce de qué envío se trata.
                'orden' => $compra->ordenCompra?->codigo,
                // En la que se pactó: los costos de las líneas vienen en ella.
                'moneda' => $compra->moneda_origen ?: 'PEN',
                'proveedor_id' => $compra->proveedor_id,
                'proveedor' => $compra->proveedor?->nombre,
                'tipo_documento' => $compra->tipo_documento,
                'serie' => $compra->serie,
                'numero' => $compra->numero,
            ],
            'lineas' => $lineas,
        ]);
    }

    /**
     * Todo lo que se recibió de una compra, para verlo aunque ya esté
     * completamente recepcionada (cuando "Recepcionar" ya no se puede abrir):
     * lo pedido y lo recibido por línea, cada recepción con sus líneas y sus
     * rollos —quién los recibió, cuándo y dónde quedaron— y lo que sigue por
     * recibir del packing list.
     */
    public function detalleDeCompra(Compra $compra)
    {
        $compra->load([
            'detalles.presentacion.producto:id,codigo,nombre',
            'detalles.color:id,nombre,codigo',
            'proveedor:id,nombre',
            'ordenCompra:id,codigo',
        ]);

        $pendientes = $compra->pendientePorLinea();
        $recibidos = $compra->recibidoPorLinea();

        $lineas = $compra->detalles->map(fn ($d) => [
            'compra_detalle_id' => $d->id,
            'codigo' => $d->presentacion?->producto?->codigo,
            'producto' => $d->presentacion?->producto?->nombre,
            'color' => $d->color ? ['nombre' => $d->color->nombre, 'codigo' => $d->color->codigo] : null,
            'unidad' => $d->presentacion?->nombre,
            'rollos' => $d->rollos ? (int) $d->rollos : null,
            'pedida' => (float) $d->cantidad,
            'recibida' => (float) ($recibidos[$d->id] ?? 0),
            'finalizada' => (float) $d->cantidad_finalizada,
            'pendiente' => (float) ($pendientes[$d->id] ?? 0),
        ])->values();

        // Quién escaneó cada rollo y a qué hora, cuando vino de un packing list.
        $escaneos = PackingListRollo::with('usuarioEscanea:id,name')
            ->where('compra_id', $compra->id)
            ->get();
        $escaneoPorCodigo = $escaneos->keyBy('codigo');

        $recepciones = RecepcionCompra::with([
            'almacen:id,nombre',
            'usuarioRecibe:id,name',
            'detalles.presentacion.producto:id,codigo,nombre',
            'detalles.compraDetalle.color:id,nombre,codigo',
            'rollos' => fn ($q) => $q->orderBy('producto_id')->orderBy('producto_color_id')->orderBy('numero'),
            'rollos.producto:id,codigo,nombre',
            'rollos.color:id,nombre,codigo',
            'rollos.almacen:id,nombre',
            'rollos.usuarioRecibe:id,name',
            'rollos.ubicacion.padre.padre.padre.padre',
        ])
            ->where('compra_id', $compra->id)
            ->orderBy('id')
            ->get()
            ->map(fn (RecepcionCompra $r) => [
                'id' => $r->id,
                'documento' => $r->documento,
                'fecha' => $r->fecha_recepcion?->toIso8601String(),
                'estado' => $r->estado,
                // Una recepción deshecha devolvió su mercadería: se ve, pero no cuenta.
                'vigente' => (bool) $r->activo,
                'almacen' => $r->almacen?->nombre,
                'recibe' => $r->usuarioRecibe?->name,
                'observaciones' => $r->observaciones,
                'detalles' => $r->detalles->map(fn ($d) => [
                    'producto' => $d->presentacion?->producto?->nombre,
                    'codigo' => $d->presentacion?->producto?->codigo,
                    'color' => $d->compraDetalle?->color?->nombre,
                    'unidad' => $d->presentacion?->nombre,
                    'pedida' => (float) $d->cantidad_ordenada,
                    'recibida' => (float) $d->cantidad_recibida,
                    'conforme' => (float) $d->cantidad_conforme,
                    'rechazada' => (float) $d->cantidad_rechazada,
                ])->values(),
                'rollos' => $r->rollos->map(function (Rollo $rollo) use ($escaneoPorCodigo, $r) {
                    $fila = $escaneoPorCodigo->get($rollo->codigo);

                    return [
                        'codigo' => $rollo->codigo,
                        'producto' => $rollo->producto?->nombre,
                        'color' => $rollo->color
                            ? ['nombre' => $rollo->color->nombre, 'codigo' => $rollo->color->codigo]
                            : null,
                        // Lo que midió al llegar; el saldo baja con cada corte.
                        'metros' => (float) $rollo->metros_inicial,
                        'metros_actual' => (float) $rollo->metros_actual,
                        'peso_kg' => $rollo->peso_kg !== null ? (float) $rollo->peso_kg : null,
                        'estado' => Rollo::ESTADOS[$rollo->estado] ?? $rollo->estado,
                        // Separada en piso, pasillo, rack, nivel y posición.
                        'ubicacion' => $rollo->ubicacionDetallada(),
                        'recibio' => $rollo->usuarioRecibe?->name
                            ?? $fila?->usuarioEscanea?->name
                            ?? $r->usuarioRecibe?->name,
                        'hora' => ($fila?->escaneado_at ?? $r->fecha_recepcion)?->toIso8601String(),
                    ];
                })->values(),
            ])
            ->values();

        $vigentes = $recepciones->where('vigente', true);
        $rollosRecibidos = $vigentes->flatMap(fn ($r) => $r['rollos']);

        return response()->json([
            'compra' => [
                'id' => $compra->id,
                'numero_compra' => $compra->numero_compra,
                'estado' => $compra->estado,
                'finalizado' => (bool) $compra->finalizado,
                'motivo_finalizacion' => $compra->motivo_finalizacion,
                'orden' => $compra->ordenCompra?->codigo,
                'proveedor' => $compra->proveedor?->nombre,
            ],
            'lineas' => $lineas,
            'recepciones' => $recepciones,
            // Lo que el proveedor dijo que mandaba y todavía no ingresó al almacén.
            'por_recibir' => $escaneos
                ->where('estado', '!=', PackingListRollo::REGISTRADO)
                ->map(fn ($f) => $this->filaPackingList($f->loadMissing('color:id,nombre,codigo')))
                ->values(),
            'resumen' => [
                'recepciones' => $vigentes->count(),
                'rollos' => $rollosRecibidos->count(),
                'metros' => round((float) $rollosRecibidos->sum('metros'), 2),
            ],
        ]);
    }

    /**
     * Registra una recepción (total o parcial) contra una compra. No se puede
     * recibir más de lo pendiente de cada línea.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'compra_id' => 'required|exists:compras,id',
            'almacen_id' => 'required|exists:almacenes,id',
            'numero_documento' => 'nullable|string|max:255',
            'tipo_documento' => 'nullable|string|max:50',
            'fecha_recepcion' => 'required|date',
            'observaciones' => 'nullable|string',

            // El embarque del que llega la mercadería. Se escribe aquí y se da
            // de alta solo la primera vez que se nombra.
            'importacion_codigo' => 'nullable|string|max:60',
            'importacion_documento' => 'nullable|string|max:100',

            'detalles' => 'required|array|min:1',
            'detalles.*.compra_detalle_id' => 'required|exists:compra_detalles,id',
            'detalles.*.cantidad_recibida' => 'required|numeric|min:0.01',

            // Mercadería que se maneja pieza por pieza: los rollos que trae el
            // packing list. Cuando vienen, la cantidad recibida se calcula de
            // ellos y no de lo que se teclee, para que no puedan discrepar.
            'detalles.*.producto_color_id' => 'nullable|exists:producto_colores,id',
            'detalles.*.codigo_proveedor' => 'nullable|string|max:100',
            'detalles.*.rollos' => 'nullable|array',
            'detalles.*.rollos.*.metros' => 'required|numeric|min:0.01',
            'detalles.*.rollos.*.peso_kg' => 'nullable|numeric|min:0',
            // Del packing list en Excel, cuando ya trae el código único de
            // fábrica de ese rollo (si no viene, se genera como siempre).
            'detalles.*.rollos.*.codigo' => 'nullable|string|max:100',

            // Dónde se guardan los rollos de esta línea. Se pregunta al
            // recibir porque es el único momento en que alguien lo sabe.
            // Si el almacén ya tiene su árbol de ubicaciones armado, se manda
            // el nodo elegido; si no, se sigue aceptando el texto libre de
            // siempre.
            'detalles.*.almacen_ubicacion_id' => 'nullable|exists:almacen_ubicaciones,id',
            'detalles.*.pasillo' => 'nullable|string|max:20',
            'detalles.*.rack' => 'nullable|string|max:20',
            'detalles.*.nivel' => 'nullable|string|max:20',
            'detalles.*.posicion' => 'nullable|string|max:20',
        ]);

        try {
            $recepcion = DB::transaction(function () use ($data) {
                $compra = Compra::with('detalles')->lockForUpdate()->findOrFail($data['compra_id']);

                // El stock siempre se valoriza en soles. Una compra en otra
                // moneda trae su costo en esa moneda (lo que se pactó con el
                // proveedor); aquí se convierte, así el costo promedio y las
                // utilidades no mezclan monedas.
                $tipoCambio = $compra->moneda_origen && $compra->moneda_origen !== 'PEN'
                    ? (float) ($compra->tipo_cambio ?: 1)
                    : 1.0;

                if ($compra->estado === 'anulada') {
                    throw new \RuntimeException('La compra está anulada: no admite recepciones.');
                }

                if ($compra->finalizado) {
                    throw new \RuntimeException('La compra está finalizada: ya no admite recepciones.');
                }

                $pendientes = $compra->pendientePorLinea();

                $recepcion = RecepcionCompra::create([
                    'compra_id' => $compra->id,
                    'orden_compra_id' => $compra->orden_compra_id,
                    'proveedor_id' => $compra->proveedor_id,
                    'almacen_id' => $data['almacen_id'],
                    'serie' => RecepcionCompra::SERIE,
                    'numero' => $this->siguienteNumero(),
                    'numero_documento' => $data['numero_documento'] ?? null,
                    'tipo_documento' => $data['tipo_documento'] ?? null,
                    'fecha_recepcion' => $data['fecha_recepcion'],
                    'observaciones' => $data['observaciones'] ?? null,
                    'estado' => 'parcial',
                    'activo' => true,
                    'stock_aplicado' => true,
                    'usuario_recibe_id' => auth()->id(),
                ]);

                $almacen = Almacen::findOrFail($data['almacen_id']);
                $stock = app(StockService::class);

                $importacion = Importacion::porCodigo(
                    $data['importacion_codigo'] ?? null,
                    $compra->proveedor_id,
                    $data['fecha_recepcion'],
                );

                // El documento de embarque se completa si llega y aún no lo tiene.
                if ($importacion && ! $importacion->documento && ! empty($data['importacion_documento'])) {
                    $importacion->update(['documento' => $data['importacion_documento']]);
                }

                foreach ($data['detalles'] as $detalle) {
                    $linea = $compra->detalles->firstWhere('id', $detalle['compra_detalle_id']);
                    if (! $linea || $linea->compra_id !== $compra->id) {
                        throw new \RuntimeException('Una de las líneas no pertenece a esta compra.');
                    }

                    if (! empty($detalle['almacen_ubicacion_id'])
                        && ! Almacen::find($data['almacen_id'])->ubicaciones()->where('id', $detalle['almacen_ubicacion_id'])->exists()
                    ) {
                        throw new \RuntimeException('La ubicación elegida no pertenece a este almacén.');
                    }

                    $presentacionLinea = ProductoPresentacion::with('producto')
                        ->findOrFail($linea->producto_presentacion_id);

                    // Con rollos capturados, la cantidad sale de ellos: es la
                    // única forma de que el stock y las piezas no discrepen.
                    $cantidad = ! empty($detalle['rollos'])
                        ? $this->cantidadDeRollos($presentacionLinea, $detalle['rollos'])
                        : (float) $detalle['cantidad_recibida'];

                    $pendiente = $pendientes[$linea->id] ?? 0;

                    if ($cantidad > $pendiente + 0.001) {
                        throw new \RuntimeException(
                            "No puedes recibir {$cantidad} de \"{$linea->presentacion?->producto?->nombre}\": solo quedan {$pendiente} pendientes."
                        );
                    }

                    $presentacion = $presentacionLinea;
                    // Tal como está en la compra: en soles, o en dólares si
                    // así se pactó con el proveedor.
                    $costoPresentacion = (float) $linea->costo_unitario;
                    // El que de verdad se usa para valorizar el stock.
                    $costoPresentacionPen = round($costoPresentacion * $tipoCambio, 4);

                    // StockService valoriza en unidad base; el costo es por presentación.
                    $factor = (float) $presentacion->factor_conversion ?: 1;
                    $costoBasePen = $factor > 0 ? $costoPresentacionPen / $factor : $costoPresentacionPen;

                    // El origen del movimiento es la recepción: la compra es el
                    // documento comercial, no el motivo del ingreso al almacén.
                    $movimiento = $stock->entrada(
                        $presentacion, $almacen, $cantidad, $costoBasePen,
                        'recepcion', 'recepcion_compra', $recepcion->id, auth()->id(),
                        // Con rollos, la línea se recibe en un color: queda en el kardex.
                        colorId: ! empty($detalle['producto_color_id']) ? (int) $detalle['producto_color_id'] : null,
                    );

                    $recepcion->detalles()->create([
                        'compra_detalle_id' => $linea->id,
                        'producto_presentacion_id' => $presentacion->id,
                        'cantidad_pedida' => (float) $linea->cantidad,
                        'cantidad_ordenada' => (float) $linea->cantidad,
                        'cantidad_recibida' => $cantidad,
                        'cantidad_conforme' => $cantidad,
                        'cantidad_rechazada' => 0,
                        // El original (para trazabilidad con lo que se pactó)
                        // y el convertido (para poder deshacer sin adivinar el
                        // tipo de cambio del día que se usó).
                        'costo_unitario' => $costoPresentacion,
                        'costo_unitario_pen' => $costoPresentacionPen,
                        // El movimiento guarda el saldo resultante en unidad base.
                        'stock_anterior' => (float) $movimiento->stock_anterior,
                        'stock_nuevo' => (float) $movimiento->saldo_stock,
                    ]);

                    // Las piezas físicas, si esta mercadería se maneja así. El
                    // stock ya lo movió la entrada de arriba, por eso no se
                    // vuelve a tocar.
                    if (! empty($detalle['rollos'])) {
                        // Los rollos que vienen del packing list cargado solo
                        // entran si ya se escanearon: es lo que confirma que
                        // llegaron. Cada uno conserva quién lo escaneó.
                        $delPackingList = PackingListRollo::where('compra_id', $compra->id)
                            ->whereIn('codigo', collect($detalle['rollos'])->pluck('codigo')->filter()->all())
                            ->lockForUpdate()
                            ->get()
                            ->keyBy('codigo');

                        foreach ($detalle['rollos'] as $i => $r) {
                            $fila = $delPackingList->get($r['codigo'] ?? '');
                            if (! $fila) {
                                continue;
                            }
                            if ($fila->estado === PackingListRollo::PENDIENTE) {
                                throw new \RuntimeException("El rollo {$fila->codigo} todavía no se escaneó: escanéalo antes de registrar la recepción.");
                            }
                            if ($fila->estado === PackingListRollo::REGISTRADO) {
                                throw new \RuntimeException("El rollo {$fila->codigo} ya ingresó al almacén.");
                            }
                            $detalle['rollos'][$i]['usuario_recibe_id'] = $fila->usuario_escanea_id;
                        }

                        app(RolloService::class)->ingresar(
                            $presentacion->producto,
                            isset($detalle['producto_color_id'])
                                ? ProductoColor::find($detalle['producto_color_id'])
                                : null,
                            $almacen,
                            $detalle['rollos'],
                            $this->costoPorMetro($presentacion, $costoPresentacionPen),
                            $recepcion,
                            ($detalle['codigo_proveedor'] ?? null) ?: $this->codigoBaseCompra($compra),
                            auth()->id(),
                            actualizarStock: false,
                            importacion: $importacion,
                            ubicacion: [
                                'almacen_ubicacion_id' => $detalle['almacen_ubicacion_id'] ?? null,
                                'pasillo' => $detalle['pasillo'] ?? null,
                                'rack' => $detalle['rack'] ?? null,
                                'nivel' => $detalle['nivel'] ?? null,
                                'posicion' => $detalle['posicion'] ?? null,
                            ],
                        );

                        // Ya son rollos del almacén: dejan de estar "por recibir".
                        if ($delPackingList->isNotEmpty()) {
                            PackingListRollo::where('compra_id', $compra->id)
                                ->whereIn('codigo', $delPackingList->keys()->all())
                                ->update(['estado' => PackingListRollo::REGISTRADO, 'recepcion_id' => $recepcion->id]);
                        }
                    }
                }

                $this->refrescarEstados($recepcion->fresh(), $compra);

                return $recepcion;
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($recepcion->load(self::RELACIONES), 201);
    }

    /** Deshace la recepción: revierte el stock que ingresó y la deja inactiva. */
    public function deshacer(RecepcionCompra $recepcionesCompra)
    {
        if (! $recepcionesCompra->activo) {
            return response()->json(['message' => 'La recepción ya está deshecha.'], 422);
        }

        try {
            DB::transaction(function () use ($recepcionesCompra) {
                $almacen = $recepcionesCompra->almacen;
                $stock = app(StockService::class);

                // Los rollos que entraron con esta recepción se van con ella.
                // Si alguno ya se movió no se puede deshacer: la mercadería
                // salió del almacén y borrarla dejaría el inventario mintiendo.
                $rollos = $recepcionesCompra->rollos()->get();

                $tocados = $rollos->filter(
                    fn ($r) => $r->estado !== 'disponible'
                        || (float) $r->metros_actual !== (float) $r->metros_inicial
                );

                if ($tocados->isNotEmpty()) {
                    throw new \RuntimeException(
                        'No se puede deshacer: estos rollos ya se movieron — '
                        .$tocados->pluck('codigo')->take(5)->implode(', ')
                        .($tocados->count() > 5 ? ' y otros' : '').'.'
                    );
                }

                foreach ($rollos as $rollo) {
                    $rollo->movimientos()->delete();
                    $rollo->delete();
                }

                // Los rollos del packing list vuelven a estar por recibir: se
                // pueden escanear de nuevo y registrar otra recepción.
                PackingListRollo::where('recepcion_id', $recepcionesCompra->id)->update([
                    'estado' => PackingListRollo::PENDIENTE,
                    'recepcion_id' => null,
                    'usuario_escanea_id' => null,
                    'escaneado_at' => null,
                ]);

                foreach ($recepcionesCompra->detalles as $detalle) {
                    $presentacion = ProductoPresentacion::findOrFail($detalle->producto_presentacion_id);
                    $factor = (float) $presentacion->factor_conversion ?: 1;
                    // El costo ya en soles, tal como se usó al recibir. Las
                    // recepciones de antes de esta columna no lo tienen: se
                    // asume que ya estaban en soles (compra sin dólares).
                    $costoPen = $detalle->costo_unitario_pen !== null
                        ? (float) $detalle->costo_unitario_pen
                        : (float) $detalle->costo_unitario;
                    $costoBase = $factor > 0 ? $costoPen / $factor : $costoPen;

                    $stock->salida(
                        $presentacion, $almacen, (float) $detalle->cantidad_recibida, $costoBase,
                        'recepcion_deshecha', 'recepcion_compra', $recepcionesCompra->id, auth()->id(),
                    );
                }

                $recepcionesCompra->update([
                    'activo' => false,
                    'stock_aplicado' => false,
                    'estado' => 'deshecha',
                ]);

                if ($recepcionesCompra->compra) {
                    $this->refrescarEstados($recepcionesCompra, $recepcionesCompra->compra->fresh('detalles'));
                }
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($recepcionesCompra->fresh()->load(self::RELACIONES));
    }

    public function show(RecepcionCompra $recepcionesCompra)
    {
        return response()->json($recepcionesCompra->load(self::RELACIONES));
    }

    public function update(Request $request, RecepcionCompra $recepcionesCompra)
    {
        $data = $request->validate(['observaciones' => 'nullable|string']);
        $recepcionesCompra->update($data);
        return response()->json($recepcionesCompra);
    }

    public function destroy(RecepcionCompra $recepcionesCompra)
    {
        if ($recepcionesCompra->stock_aplicado) {
            return response()->json([
                'message' => 'Esta recepción ingresó stock. Deshazla primero para revertirlo.',
            ], 422);
        }

        $recepcionesCompra->detalles()->delete();
        $recepcionesCompra->delete();
        return response()->json(['message' => 'Eliminado']);
    }

    /**
     * Lee el Excel del packing list del proveedor y deja cada rollo
     * "pendiente de recibir" en la compra. Todavía no es stock: el almacén los
     * va escaneando al llegar y recién al confirmar la recepción se vuelven
     * rollos de verdad.
     *
     * Columnas esperadas (por nombre de cabecera, sin importar mayúsculas ni
     * el orden de las columnas): Orden, Código único, Producto, Color,
     * Metros, Peso neto; "Envío" es opcional. "Producto" y "Color" van por su
     * código (el de `productos.codigo` y el del catálogo compartido de
     * colores); también se acepta el producto con su color en una sola
     * columna (01-01-030-0074).
     *
     * Lo que no se puede cargar se señala fila por fila —producto o color
     * desconocido, código repetido o ya existente— para corregir el Excel y
     * volver a cargarlo. Volver a cargarlo actualiza lo que sigue pendiente y
     * respeta lo que ya se escaneó.
     */
    public function leerPackingList(Request $request)
    {
        $data = $request->validate([
            'compra_id' => 'required|exists:compras,id',
            'archivo' => 'required|file|mimes:xlsx,xls|max:5120',
        ]);

        $compra = Compra::with(['detalles.presentacion.producto.colores', 'ordenCompra:id,codigo'])
            ->findOrFail($data['compra_id']);

        if ($compra->estado === 'anulada' || $compra->finalizado) {
            return response()->json(['message' => 'La compra está anulada o finalizada: ya no admite packing list.'], 422);
        }

        try {
            $hoja = \PhpOffice\PhpSpreadsheet\IOFactory::load($data['archivo']->getRealPath())->getActiveSheet();
        } catch (\Throwable $e) {
            return response()->json(['message' => 'No se pudo leer el archivo: ¿es un Excel válido?'], 422);
        }

        $filas = $hoja->toArray(null, true, true, false);
        if (count($filas) < 2) {
            return response()->json(['message' => 'El archivo no tiene filas de datos.'], 422);
        }

        // La cabecera puede venir en cualquier orden de columnas: se ubica
        // cada una por su nombre, no por posición fija.
        $col = $this->mapaColumnas($filas[0]);
        foreach (['codigo', 'producto', 'color', 'metros'] as $clave) {
            if (! isset($col[$clave])) {
                return response()->json([
                    'message' => "Falta la columna \"{$clave}\" en el Excel. Se esperan: Orden, Código único, Producto, Color, Metros, Peso neto.",
                ], 422);
            }
        }

        $ordenCompra = mb_strtoupper(trim((string) $compra->ordenCompra?->codigo));
        $yaCargados = PackingListRollo::where('compra_id', $compra->id)->get()->keyBy('codigo');

        $validos = [];
        $advertencias = [];
        $vistos = [];
        $avisoOrden = false;

        foreach (array_slice($filas, 1) as $i => $fila) {
            $numeroFila = $i + 2;
            $codigo = trim((string) ($fila[$col['codigo']] ?? ''));
            $codigoProducto = trim((string) ($fila[$col['producto']] ?? ''));
            $codigoColor = trim((string) ($fila[$col['color']] ?? ''));
            $metros = (float) ($fila[$col['metros']] ?? 0);
            $peso = isset($col['peso']) ? (float) ($fila[$col['peso']] ?? 0) : null;
            $envio = isset($col['envio']) ? trim((string) ($fila[$col['envio']] ?? '')) : '';

            if ($codigo === '' && $codigoProducto === '' && $metros <= 0) {
                continue; // fila vacía, tolerada al final del archivo
            }

            if ($metros <= 0) {
                $advertencias[] = "Fila {$numeroFila}: sin metros, se omite.";
                continue;
            }

            if ($codigo === '') {
                $advertencias[] = "Fila {$numeroFila}: no trae código único: sin él no se puede escanear el rollo, se omite.";
                continue;
            }

            // La orden del Excel debe ser la de esta compra: evita cargar el
            // packing list de otro envío por error.
            if (! $avisoOrden && isset($col['orden']) && $ordenCompra !== '') {
                $ordenExcel = mb_strtoupper(trim((string) ($fila[$col['orden']] ?? '')));
                if ($ordenExcel !== '' && $ordenExcel !== $ordenCompra) {
                    $advertencias[] = "Fila {$numeroFila}: la orden del Excel ({$ordenExcel}) no es la de esta compra ({$ordenCompra}). Revisa que sea el archivo correcto.";
                    $avisoOrden = true; // una sola vez: si está mal, está mal en todo el archivo
                }
            }

            // El producto puede venir con su color pegado: 01-01-030-0074.
            $linea = $compra->detalles->first(
                fn ($d) => $d->presentacion?->producto?->codigo === $codigoProducto
            );
            if (! $linea && $codigoColor === '' && preg_match('/^(.+)-(\d{4})$/', $codigoProducto, $m)) {
                $linea = $compra->detalles->first(
                    fn ($d) => $d->presentacion?->producto?->codigo === $m[1]
                );
                if ($linea) {
                    $codigoProducto = $m[1];
                    $codigoColor = $m[2];
                }
            }
            if (! $linea) {
                $advertencias[] = "Fila {$numeroFila}: el producto \"{$codigoProducto}\" no está en esta compra.";
                continue;
            }

            $productoColor = $linea->presentacion->producto->colores
                ->first(fn ($c) => $c->codigo === $codigoColor);
            if ($codigoColor !== '' && ! $productoColor) {
                $advertencias[] = "Fila {$numeroFila}: el color \"{$codigoColor}\" no existe para \"{$codigoProducto}\".";
                continue;
            }

            // Un código repetido no se puede escanear con certeza: se señala
            // para corregirlo en el Excel antes de confirmar.
            if (isset($vistos[$codigo])) {
                $advertencias[] = "Fila {$numeroFila}: el código \"{$codigo}\" está repetido en el archivo (ya estaba en la fila {$vistos[$codigo]}).";
                continue;
            }
            $vistos[$codigo] = $numeroFila;

            $previo = $yaCargados->get($codigo);
            if ($previo?->estado === PackingListRollo::REGISTRADO) {
                $advertencias[] = "Fila {$numeroFila}: el rollo \"{$codigo}\" ya ingresó al almacén, no se vuelve a cargar.";
                continue;
            }

            if (! $previo && \App\Models\Rollo::where('codigo', $codigo)->exists()) {
                $advertencias[] = "Fila {$numeroFila}: ya existe un rollo con el código \"{$codigo}\" en el almacén.";
                continue;
            }

            if (! $previo && PackingListRollo::where('codigo', $codigo)->where('compra_id', '!=', $compra->id)->exists()) {
                $advertencias[] = "Fila {$numeroFila}: el código \"{$codigo}\" ya está en el packing list de otra compra.";
                continue;
            }

            $validos[$codigo] = [
                'compra_detalle_id' => $linea->id,
                'producto_color_id' => $productoColor?->id,
                'codigo' => $codigo,
                'metros' => round($metros, 2),
                'peso_kg' => $peso > 0 ? round($peso, 3) : null,
                'envio' => $envio !== '' ? $envio : null,
            ];
        }

        DB::transaction(function () use ($compra, $validos, $yaCargados) {
            foreach ($validos as $codigo => $fila) {
                $previo = $yaCargados->get($codigo);

                if (! $previo) {
                    PackingListRollo::create($fila + [
                        'compra_id' => $compra->id,
                        'estado' => PackingListRollo::PENDIENTE,
                        'usuario_carga_id' => auth()->id(),
                    ]);
                } elseif ($previo->estado === PackingListRollo::PENDIENTE) {
                    // Lo corregido en el Excel reemplaza lo pendiente; lo ya
                    // escaneado no se toca.
                    $previo->update($fila);
                }
            }

            // Lo pendiente que el Excel corregido ya no trae, sale de la lista.
            if ($validos !== []) {
                PackingListRollo::where('compra_id', $compra->id)
                    ->where('estado', PackingListRollo::PENDIENTE)
                    ->whereNotIn('codigo', array_keys($validos))
                    ->delete();
            }
        });

        // Solo lo que se cargó ahora, agrupado por línea y color, para el aviso.
        $grupos = [];
        foreach ($validos as $fila) {
            $linea = $compra->detalles->firstWhere('id', $fila['compra_detalle_id']);
            $clave = $fila['compra_detalle_id'].'-'.($fila['producto_color_id'] ?? '0');
            $grupos[$clave] ??= [
                'compra_detalle_id' => $fila['compra_detalle_id'],
                'producto' => $linea->presentacion->producto->nombre,
                'producto_color_id' => $fila['producto_color_id'],
                'rollos' => [],
            ];
            $grupos[$clave]['rollos'][] = [
                'codigo' => $fila['codigo'],
                'metros' => $fila['metros'],
                'peso_kg' => $fila['peso_kg'],
            ];
        }

        return response()->json([
            'detalles' => array_values($grupos),
            'advertencias' => $advertencias,
            'packing_list' => $this->resumenPackingList($compra),
        ]);
    }

    /** El packing list cargado de una compra, con lo que ya se escaneó. */
    public function packingList(Compra $compra)
    {
        return response()->json($this->resumenPackingList($compra));
    }

    /**
     * El almacén escanea un rollo al recibirlo: queda "recibido", con quién y
     * cuándo. Si otro almacenero ya lo escaneó, se avisa en vez de contarlo
     * dos veces.
     */
    public function escanearRollo(Request $request)
    {
        $data = $request->validate([
            'compra_id' => 'required|exists:compras,id',
            'codigo' => 'required|string|max:100',
        ]);

        $codigo = trim($data['codigo']);
        $compra = Compra::findOrFail($data['compra_id']);

        if ($compra->estado === 'anulada' || $compra->finalizado) {
            return response()->json(['message' => 'La compra está anulada o finalizada: no admite recepciones.'], 422);
        }

        try {
            $fila = DB::transaction(function () use ($compra, $codigo) {
                $fila = PackingListRollo::where('compra_id', $compra->id)
                    ->where('codigo', $codigo)
                    ->lockForUpdate()
                    ->first();

                if (! $fila) {
                    $deOtra = PackingListRollo::with('compra:id,correlativo')->where('codigo', $codigo)->first();
                    if ($deOtra) {
                        throw new \RuntimeException("El rollo {$codigo} es del packing list de otra compra ({$deOtra->compra?->numero_compra}).");
                    }
                    if (\App\Models\Rollo::where('codigo', $codigo)->exists()) {
                        throw new \RuntimeException("El rollo {$codigo} ya está en el almacén.");
                    }
                    throw new \RuntimeException("El rollo {$codigo} no está en el packing list de esta compra.");
                }

                if ($fila->estado === PackingListRollo::REGISTRADO) {
                    throw new \RuntimeException("El rollo {$codigo} ya ingresó al almacén.");
                }

                if ($fila->estado === PackingListRollo::RECIBIDO) {
                    $quien = $fila->usuarioEscanea?->name ?? 'otro usuario';
                    $hora = $fila->escaneado_at?->timezone(config('app.timezone'))->format('H:i');
                    throw new \RuntimeException("El rollo {$codigo} ya fue escaneado por {$quien}".($hora ? " a las {$hora}" : '').'.');
                }

                $fila->update([
                    'estado' => PackingListRollo::RECIBIDO,
                    'usuario_escanea_id' => auth()->id(),
                    'escaneado_at' => now(),
                ]);

                return $fila;
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'rollo' => $this->filaPackingList($fila->load(['usuarioEscanea:id,name', 'color:id,nombre,codigo'])),
            'packing_list' => $this->resumenPackingList($compra),
        ]);
    }

    /** Deshace un escaneo equivocado: el rollo vuelve a "pendiente". */
    public function quitarEscaneo(Request $request)
    {
        $data = $request->validate([
            'compra_id' => 'required|exists:compras,id',
            'codigo' => 'required|string|max:100',
        ]);

        $fila = PackingListRollo::where('compra_id', $data['compra_id'])
            ->where('codigo', trim($data['codigo']))
            ->first();

        if (! $fila || $fila->estado !== PackingListRollo::RECIBIDO) {
            return response()->json(['message' => 'Ese rollo no está marcado como recibido.'], 422);
        }

        $fila->update([
            'estado' => PackingListRollo::PENDIENTE,
            'usuario_escanea_id' => null,
            'escaneado_at' => null,
        ]);

        return response()->json([
            'packing_list' => $this->resumenPackingList(Compra::findOrFail($data['compra_id'])),
        ]);
    }

    /** Una fila del packing list tal como la consume la pantalla. */
    private function filaPackingList(PackingListRollo $f): array
    {
        return [
            'id' => $f->id,
            'compra_detalle_id' => $f->compra_detalle_id,
            'producto_color_id' => $f->producto_color_id,
            'color' => $f->color?->nombre,
            'color_codigo' => $f->color?->codigo,
            'codigo' => $f->codigo,
            'metros' => (float) $f->metros,
            'peso_kg' => $f->peso_kg !== null ? (float) $f->peso_kg : null,
            'envio' => $f->envio,
            'estado' => $f->estado,
            'escaneado_por' => $f->usuarioEscanea?->name,
            'escaneado_at' => $f->escaneado_at?->toIso8601String(),
            'recepcion_id' => $f->recepcion_id,
        ];
    }

    /** Las filas del packing list de la compra y el avance de la recepción. */
    private function resumenPackingList(Compra $compra): array
    {
        $filas = PackingListRollo::with(['usuarioEscanea:id,name', 'color:id,nombre,codigo'])
            ->where('compra_id', $compra->id)
            ->orderBy('id')
            ->get();

        $porEstado = fn (string $estado) => $filas->where('estado', $estado);

        return [
            'filas' => $filas->map(fn ($f) => $this->filaPackingList($f))->values(),
            'resumen' => [
                'total' => $filas->count(),
                'pendientes' => $porEstado(PackingListRollo::PENDIENTE)->count(),
                'recibidos' => $porEstado(PackingListRollo::RECIBIDO)->count(),
                'registrados' => $porEstado(PackingListRollo::REGISTRADO)->count(),
                'metros_total' => round((float) $filas->sum('metros'), 2),
                'metros_pendientes' => round((float) $porEstado(PackingListRollo::PENDIENTE)->sum('metros'), 2),
                'metros_recibidos' => round((float) $porEstado(PackingListRollo::RECIBIDO)->sum('metros'), 2),
            ],
        ];
    }

    /** Ubica cada columna esperada por el texto de su cabecera. */
    private function mapaColumnas(array $cabecera): array
    {
        $alias = [
            'codigo' => ['codigo unico', 'codigo unico del rollo', 'codigo', 'código único', 'código'],
            'producto' => ['producto', 'tela', 'producto con color', 'codigo producto'],
            'color' => ['color', 'codigo color'],
            'metros' => ['metros', 'metraje', 'metraje de fabrica'],
            'peso' => ['peso neto', 'peso', 'peso kg', 'peso (kg)'],
            'orden' => ['orden', 'orden de compra'],
            'envio' => ['envio', 'envío', 'n° de envio', 'numero de envio', 'embarque'],
        ];

        $normalizar = fn ($t) => strtolower(trim((string) preg_replace('/\s+/', ' ', str_replace(
            ['á', 'é', 'í', 'ó', 'ú'], ['a', 'e', 'i', 'o', 'u'], (string) $t
        ))));

        $mapa = [];
        foreach ($cabecera as $indice => $texto) {
            $texto = $normalizar($texto);
            foreach ($alias as $clave => $nombres) {
                if (in_array($texto, $nombres, true)) {
                    $mapa[$clave] = $indice;
                }
            }
        }

        return $mapa;
    }

    /** Ajusta el estado de la recepción y de la compra según lo que falte. */
    private function refrescarEstados(RecepcionCompra $recepcion, Compra $compra): void
    {
        $compra = $compra->fresh('detalles');
        $faltante = array_sum($compra->pendientePorLinea());
        $pedido = (float) $compra->detalles->sum('cantidad');

        if ($recepcion->activo) {
            $recepcion->update(['estado' => $faltante > 0 ? 'parcial' : 'completa']);
        }

        // Una compra finalizada conserva su estado: ya se cerró a mano.
        if ($compra->finalizado) {
            return;
        }

        // Sin nada recibido vuelve a "registrada"; es el caso de deshacer todo.
        $compra->update(['estado' => match (true) {
            $faltante <= 0 => 'recepcionada',
            abs($faltante - $pedido) < 0.001 => 'registrada',
            default => 'parcial',
        }]);
    }

    /** Correlativo formal del documento, ej. RC01-0024. */
    private function siguienteNumero(): string
    {
        $serieDoc = SerieDocumento::where('tipo_documento', 'recepcion_almacen')
            ->where('serie', RecepcionCompra::SERIE)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'recepcion_almacen', 'serie' => RecepcionCompra::SERIE],
                ['numero_actual' => 0, 'activo' => true]
            );

        $serieDoc->increment('numero_actual');

        return str_pad($serieDoc->numero_actual, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Cuántas unidades de la presentación suman los rollos recibidos.
     *
     * El packing list viene en metros y el stock se lleva en la unidad de la
     * presentación ("Rollo 50 m", "Metro"), así que hay que convertir.
     */
    private function cantidadDeRollos(ProductoPresentacion $presentacion, array $rollos): float
    {
        $metros = collect($rollos)->sum(fn ($r) => (float) ($r['metros'] ?? 0));
        $base = $metros * ($presentacion->producto?->factorBasePorMetro() ?? 1);
        $factor = (float) ($presentacion->factor_conversion ?: 1);

        return round($base / $factor, 2);
    }

    /** El costo de la línea, llevado a soles por metro. */
    private function costoPorMetro(ProductoPresentacion $presentacion, float $costoPresentacion): float
    {
        $factor = (float) ($presentacion->factor_conversion ?: 1);
        $basePorMetro = max((float) ($presentacion->producto?->factorBasePorMetro() ?? 1), 1);

        return round($costoPresentacion / $factor * $basePorMetro, 4);
    }

    /**
     * El prefijo del código de rollo cuando nadie escribió uno a mano.
     *
     * Es el código de la orden de compra (KET-003-26): los rollos continúan
     * la numeración de la orden con la que se pidieron, así la etiqueta dice
     * de qué orden vino cada uno. Una compra sin orden usa el código corto del
     * proveedor con su propio correlativo; sin código corto, se devuelve null
     * y RolloService cae al esquema de siempre (producto + color).
     */
    private function codigoBaseCompra(Compra $compra): ?string
    {
        if ($compra->ordenCompra?->codigo) {
            return $compra->ordenCompra->codigo;
        }

        $corto = $compra->proveedor?->codigo_corto;
        if (! $corto) {
            return null;
        }

        $anio = ($compra->fecha ?? now())->format('y');

        return sprintf('%s-%03d-%s', $corto, $compra->correlativo, $anio);
    }
}
