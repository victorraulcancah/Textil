<?php

namespace App\Http\Controllers;

use App\Models\Almacen;
use App\Models\Compra;
use App\Models\Importacion;
use App\Models\ProductoColor;
use App\Models\ProductoPresentacion;
use App\Models\RecepcionCompra;
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
        $compra->load(['detalles.presentacion.producto.marca', 'detalles.presentacion.producto.colores', 'proveedor:id,nombre']);

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
     * Lee el Excel del packing list del proveedor y arma una vista previa:
     * qué línea de la compra y qué color corresponde a cada grupo de rollos,
     * con su código, metraje y peso ya leídos. No crea nada —el almacenero
     * revisa y recién al pulsar "Registrar recepción" se guarda de verdad—.
     *
     * Columnas esperadas (por nombre de cabecera, sin importar mayúsculas ni
     * el orden de las columnas): Orden, Código único, Producto, Color,
     * Metros, Peso neto. "Producto" y "Color" van por su código (el de
     * `productos.codigo` y el de `producto_colores.codigo` o el del
     * catálogo compartido de colores).
     */
    public function leerPackingList(Request $request)
    {
        $data = $request->validate([
            'compra_id' => 'required|exists:compras,id',
            'archivo' => 'required|file|mimes:xlsx,xls|max:5120',
        ]);

        $compra = Compra::with(['detalles.presentacion.producto.colores'])->findOrFail($data['compra_id']);

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

        $grupos = [];
        $advertencias = [];

        foreach (array_slice($filas, 1) as $i => $fila) {
            $numeroFila = $i + 2;
            $codigo = trim((string) ($fila[$col['codigo']] ?? ''));
            $codigoProducto = trim((string) ($fila[$col['producto']] ?? ''));
            $codigoColor = trim((string) ($fila[$col['color']] ?? ''));
            $metros = (float) ($fila[$col['metros']] ?? 0);
            $peso = isset($col['peso']) ? (float) ($fila[$col['peso']] ?? 0) : null;

            if ($codigo === '' && $codigoProducto === '' && $metros <= 0) {
                continue; // fila vacía, tolerada al final del archivo
            }

            if ($metros <= 0) {
                $advertencias[] = "Fila {$numeroFila}: sin metros, se omite.";
                continue;
            }

            $linea = $compra->detalles->first(
                fn ($d) => $d->presentacion?->producto?->codigo === $codigoProducto
            );
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

            $clave = $linea->id.'-'.($productoColor?->id ?? '0');
            $grupos[$clave] ??= [
                'compra_detalle_id' => $linea->id,
                'producto' => $linea->presentacion->producto->nombre,
                'producto_color_id' => $productoColor?->id,
                'color' => $productoColor?->nombre,
                'color_codigo' => $productoColor?->codigo,
                'rollos' => [],
            ];
            $grupos[$clave]['rollos'][] = [
                'codigo' => $codigo !== '' ? $codigo : null,
                'metros' => round($metros, 2),
                'peso_kg' => $peso > 0 ? round($peso, 3) : null,
            ];
        }

        return response()->json([
            'detalles' => array_values($grupos),
            'advertencias' => $advertencias,
        ]);
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
