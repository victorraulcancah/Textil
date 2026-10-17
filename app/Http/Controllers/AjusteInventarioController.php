<?php

namespace App\Http\Controllers;

use App\Models\AjusteDetalle;
use App\Models\AjusteInventario;
use App\Models\Almacen;
use App\Models\Producto;
use App\Models\ProductoAlmacenStock;
use App\Models\ProductoColor;
use App\Models\ProductoPresentacion;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Models\SerieDocumento;
use App\Services\RolloService;
use App\Services\StockService;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

//
class AjusteInventarioController extends Controller
{
    private const RELACIONES = [
        'almacen:id,nombre',
        'proveedor:id,nombre',
        'usuarioSolicita:id,name',
        'detalles.presentacion.producto.marca',
        'detalles.presentacion.producto.unidadMedida',
        'detalles.presentacion.unidadBase:id,abreviatura',
        'detalles.color:id,nombre,codigo,hex,proveedor_id',
        'detalles.color.proveedor:id,nombre',
        'detalles.rollo:id,codigo,metros_inicial,recepcion_compra_id,importacion_id',
        // De dónde vino el rollo: la recepción de la compra o la importación, que dicen quién lo vendió.
        'detalles.rollo.recepcion:id,proveedor_id',
        'detalles.rollo.recepcion.proveedor:id,nombre',
        'detalles.rollo.importacion:id,proveedor_id',
        'detalles.rollo.importacion.proveedor:id,nombre',
    ];

    /**
     * Las relaciones de un ajuste. De los rollos que creó una entrada no se mandan todos (una carga inicial puede
     * traer cientos): solo cuántos son y el primer y último código, que es lo que el detalle muestra.
     */
    private function relaciones(): array
    {
        return self::RELACIONES + [
            'detalles' => fn ($q) => $q->withCount('rollosCreados')
                ->withMin('rollosCreados', 'codigo')
                ->withMax('rollosCreados', 'codigo'),
        ];
    }

    public function index()
    {
        return response()->json(
            // Cada sucursal ve sus ajustes (el Super Admin, todos).
            AlmacenAcceso::limitar(AjusteInventario::with($this->relaciones())->withCount('detalles'))->latest('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'almacen_id' => 'required|exists:almacenes,id',
            'proveedor_id' => 'nullable|exists:proveedores,id',
            'tipo' => 'required|in:entrada,salida',
            'motivo' => 'required|string',
            'observaciones' => 'nullable|string',
            // El día en que se hizo el ajuste: cualquiera hasta hoy, nunca uno futuro. Sin indicar, hoy.
            'fecha' => 'nullable|date|before_or_equal:today',
            'detalles' => 'required|array|min:1',
            // Cada línea es de uno de tres tipos:
            //  · común: una presentación y su cantidad;
            //  · tela, entrada: los rollos de un color (cuántos y de cuántos metros);
            //  · tela, sobre un rollo que ya existe: los metros que se le sacan (salida) o se le suman (entrada).
            'detalles.*.producto_presentacion_id' => 'nullable|exists:producto_presentaciones,id',
            'detalles.*.cantidad' => 'nullable|numeric|min:0.01',
            'detalles.*.producto_id' => 'nullable|exists:productos,id',
            'detalles.*.producto_color_id' => 'nullable|exists:producto_colores,id',
            'detalles.*.rollos' => 'nullable|integer|min:1|max:500',
            'detalles.*.metros_por_rollo' => 'nullable|numeric|min:0.01|max:99999',
            'detalles.*.rollo_id' => 'nullable|exists:rollos,id',
            'detalles.*.metros' => 'nullable|numeric|min:0.01',
            // El costo sale del catálogo si no se escribe uno: por unidad en lo común, por metro en las telas.
            'detalles.*.costo_unitario' => 'nullable|numeric|min:0',
            'detalles.*.costo_por_metro' => 'nullable|numeric|min:0',
        ]);

        foreach ($data['detalles'] as $i => $d) {
            // Un rollo que ya existe: en una salida se le sacan metros; en una entrada, se le suman.
            $esSobreRollo = ! empty($d['rollo_id']) && ! empty($d['metros']);
            $esEntradaTela = ! empty($d['producto_id']) && ! empty($d['rollos']) && ! empty($d['metros_por_rollo']);
            $esComun = ! empty($d['producto_presentacion_id']) && ! empty($d['cantidad']);

            if (! $esSobreRollo && ! $esEntradaTela && ! $esComun) {
                throw ValidationException::withMessages(["detalles.{$i}" => 'La línea está incompleta.']);
            }
            if ($esEntradaTela && $data['tipo'] !== 'entrada') {
                throw ValidationException::withMessages(["detalles.{$i}" => 'Agregar rollos es una entrada.']);
            }
        }

        $data['almacen_id'] = AlmacenAcceso::resolver((int) $data['almacen_id']);

        try {
            $ajuste = DB::transaction(function () use ($data) {
                $serie = AjusteInventario::serieDeAlmacen($data['almacen_id']);
                $ajuste = AjusteInventario::create([
                    'serie' => $serie,
                    'numero' => $this->siguienteNumero($serie, $data['almacen_id']),
                    'almacen_id' => $data['almacen_id'],
                    'proveedor_id' => $data['proveedor_id'] ?? null,
                    'tipo' => $data['tipo'],
                    'motivo' => $data['motivo'],
                    'observaciones' => $data['observaciones'] ?? null,
                    'estado' => 'aprobado',
                    'usuario_solicita_id' => auth()->id(),
                    'usuario_aprueba_id' => auth()->id(),
                    // El día elegido con la hora de ahora (así el kardex conserva el orden del día); sin elegir, ahora.
                    'fecha' => ! empty($data['fecha']) && $data['fecha'] < now()->toDateString()
                        ? Carbon::parse($data['fecha'])->setTimeFrom(now())
                        : now(),
                ]);

                $almacen = Almacen::findOrFail($data['almacen_id']);
                $stock = app(StockService::class);
                $total = 0;

                $rollos = app(RolloService::class);

                foreach ($data['detalles'] as $detalle) {
                    $total += match (true) {
                        ! empty($detalle['rollo_id']) && $data['tipo'] === 'entrada' => $this->entradaEnRollo($ajuste, $almacen, $detalle, $stock, $rollos),
                        ! empty($detalle['rollo_id']) => $this->salidaDeRollo($ajuste, $almacen, $detalle, $stock, $rollos),
                        ! empty($detalle['producto_id']) => $this->entradaDeRollos($ajuste, $almacen, $detalle, $stock, $rollos),
                        default => $this->lineaComun($ajuste, $almacen, $data['tipo'], $detalle, $stock),
                    };
                }

                $ajuste->update(['total' => round($total, 2)]);

                return $ajuste;
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(
            $ajuste->load($this->relaciones()),
            201
        );
    }

    /** Una presentación y su cantidad: lo de siempre. */
    private function lineaComun(AjusteInventario $ajuste, Almacen $almacen, string $tipo, array $detalle, StockService $stock): float
    {
        $presentacion = ProductoPresentacion::with('producto.presentaciones.unidadBase')->findOrFail($detalle['producto_presentacion_id']);
        $cantidad = (float) $detalle['cantidad'];

        // Una tela se ajusta por rollos: sumar o restar metros sueltos dejaría el
        // stock de rollos sin cuadrar con el de metros.
        if ($presentacion->producto?->esTela()) {
            throw new \RuntimeException("\"{$presentacion->producto->nombre}\" es una tela: se ajusta por rollos (elige el color).");
        }

        // Costo (no precio de venta) de una unidad de esta presentación: el escrito, o el del catálogo.
        $costo = isset($detalle['costo_unitario']) ? (float) $detalle['costo_unitario'] : $this->costoDe($presentacion, $almacen);
        $subtotal = round($cantidad * $costo, 2);

        $ajuste->detalles()->create([
            'producto_presentacion_id' => $presentacion->id,
            'cantidad' => $cantidad,
            'costo_unitario' => $costo,
            'subtotal' => $subtotal,
        ]);

        // "entrada" suma stock; "salida" lo resta.
        $args = [$presentacion, $almacen, $cantidad, 0, 'ajuste_manual', 'ajuste_inventario', $ajuste->id, auth()->id(), $ajuste->fecha->toDateTimeString()];
        $tipo === 'salida' ? $stock->salida(...$args) : $stock->entrada(...$args);

        return $subtotal;
    }

    /** Entrada de tela: crea los rollos de un color, cada uno con el metraje que se escribió. */
    private function entradaDeRollos(AjusteInventario $ajuste, Almacen $almacen, array $detalle, StockService $stock, RolloService $rollos): float
    {
        $producto = Producto::with('presentaciones.unidadBase')->findOrFail($detalle['producto_id']);
        $presentacion = $producto->presentacionMetro();
        if (! $presentacion) {
            throw new \RuntimeException("\"{$producto->nombre}\" no se maneja por metros: no tiene rollos.");
        }

        $color = null;
        if (! empty($detalle['producto_color_id'])) {
            $color = ProductoColor::where('producto_id', $producto->id)->find($detalle['producto_color_id']);
            if (! $color) {
                throw new \RuntimeException("Ese color no es de \"{$producto->nombre}\".");
            }
        }

        $cuantos = (int) $detalle['rollos'];
        $metros = round((float) $detalle['metros_por_rollo'], 2);
        $totalMetros = round($cuantos * $metros, 2);

        $costoPorMetro = isset($detalle['costo_por_metro'])
            ? (float) $detalle['costo_por_metro']
            : $this->costoDe($presentacion, $almacen) / max($presentacion->aMetros(1), 0.0001);
        $costoUnidad = round($costoPorMetro * $presentacion->aMetros(1), 4);
        $cantidad = $presentacion->desdeMetros($totalMetros);
        $subtotal = round($cantidad * $costoUnidad, 2);

        $creados = $rollos->ingresar(
            $producto, $color, $almacen,
            array_fill(0, $cuantos, ['metros' => $metros]),
            $costoPorMetro, null, null, auth()->id(),
            false, // el stock lo suma este ajuste, una sola vez
        );

        $linea = $ajuste->detalles()->create([
            'producto_presentacion_id' => $presentacion->id,
            'producto_color_id' => $color?->id,
            'rollos' => $cuantos,
            'cantidad' => $cantidad,
            'costo_unitario' => $costoUnidad,
            'subtotal' => $subtotal,
        ]);
        Rollo::whereIn('id', $creados->pluck('id'))->update(['ajuste_detalle_id' => $linea->id]);

        // El color queda en el kardex: así se sabe cuánto hay de cada color, no solo de la tela.
        $stock->entrada($presentacion, $almacen, $cantidad, 0, 'ajuste_manual', 'ajuste_inventario', $ajuste->id, auth()->id(), $ajuste->fecha->toDateTimeString(), colorId: $color?->id);

        return $subtotal;
    }

    /**
     * Entrada de tela sobre un rollo que ya existe: le suma metros (se midió de más, apareció tela). El rollo conserva
     * su código; si queda más largo que lo registrado de fábrica, ese metraje se actualiza a lo que de verdad tiene.
     */
    private function entradaEnRollo(AjusteInventario $ajuste, Almacen $almacen, array $detalle, StockService $stock, RolloService $rollos): float
    {
        $rollo = Rollo::with('producto.presentaciones.unidadBase')->findOrFail($detalle['rollo_id']);

        if ((int) $rollo->almacen_id !== (int) $almacen->id) {
            throw new \RuntimeException("El rollo {$rollo->codigo} no está en este almacén.");
        }
        // Uno separado, en preparación o ya vendido tiene dueño: no se le toca el metraje desde un ajuste.
        if (! in_array($rollo->estado, [Rollo::DISPONIBLE, Rollo::AGOTADO], true)) {
            throw new \RuntimeException("El rollo {$rollo->codigo} no se puede ajustar (está {$rollo->estado}).");
        }

        $presentacion = $rollo->producto->presentacionMetro();
        if (! $presentacion) {
            throw new \RuntimeException("\"{$rollo->producto->nombre}\" no se maneja por metros.");
        }

        $metros = round((float) $detalle['metros'], 2);
        $rollo = $rollos->devolver($rollo, $metros, RolloMovimiento::AJUSTE, 'ajuste_inventario', $ajuste->id, auth()->id());

        if ((float) $rollo->metros_actual > (float) $rollo->metros_inicial) {
            $rollo->update(['metros_inicial' => $rollo->metros_actual]);
        }

        $costoUnidad = isset($detalle['costo_por_metro'])
            ? round((float) $detalle['costo_por_metro'] * $presentacion->aMetros(1), 4)
            : $this->costoDe($presentacion, $almacen);
        $cantidad = $presentacion->desdeMetros($metros);
        $subtotal = round($cantidad * $costoUnidad, 2);

        $ajuste->detalles()->create([
            'producto_presentacion_id' => $presentacion->id,
            'producto_color_id' => $rollo->producto_color_id,
            'rollo_id' => $rollo->id,
            'cantidad' => $cantidad,
            'costo_unitario' => $costoUnidad,
            'subtotal' => $subtotal,
        ]);

        $stock->entrada($presentacion, $almacen, $cantidad, 0, 'ajuste_manual', 'ajuste_inventario', $ajuste->id, auth()->id(), $ajuste->fecha->toDateTimeString(), colorId: $rollo->producto_color_id);

        return $subtotal;
    }

    /** Salida de tela: saca metros de un rollo (todo el rollo, o un corte). */
    private function salidaDeRollo(AjusteInventario $ajuste, Almacen $almacen, array $detalle, StockService $stock, RolloService $rollos): float
    {
        $rollo = Rollo::with('producto.presentaciones.unidadBase')->findOrFail($detalle['rollo_id']);

        if ((int) $rollo->almacen_id !== (int) $almacen->id) {
            throw new \RuntimeException("El rollo {$rollo->codigo} no está en este almacén.");
        }
        if ($rollo->estado !== Rollo::DISPONIBLE) {
            throw new \RuntimeException("El rollo {$rollo->codigo} no está disponible (está {$rollo->estado}).");
        }

        $presentacion = $rollo->producto->presentacionMetro();
        if (! $presentacion) {
            throw new \RuntimeException("\"{$rollo->producto->nombre}\" no se maneja por metros.");
        }

        $metros = round((float) $detalle['metros'], 2);
        // Lanza si el rollo no tiene tantos metros.
        $rollos->cortar($rollo, $metros, RolloMovimiento::AJUSTE, 'ajuste_inventario', $ajuste->id, auth()->id());

        $costoUnidad = isset($detalle['costo_por_metro'])
            ? round((float) $detalle['costo_por_metro'] * $presentacion->aMetros(1), 4)
            : $this->costoDe($presentacion, $almacen);
        $cantidad = $presentacion->desdeMetros($metros);
        $subtotal = round($cantidad * $costoUnidad, 2);

        $ajuste->detalles()->create([
            'producto_presentacion_id' => $presentacion->id,
            'producto_color_id' => $rollo->producto_color_id,
            'rollo_id' => $rollo->id,
            'cantidad' => $cantidad,
            'costo_unitario' => $costoUnidad,
            'subtotal' => $subtotal,
        ]);

        $stock->salida($presentacion, $almacen, $cantidad, 0, 'ajuste_manual', 'ajuste_inventario', $ajuste->id, auth()->id(), $ajuste->fecha->toDateTimeString(), colorId: $rollo->producto_color_id);

        return $subtotal;
    }

    public function show(AjusteInventario $ajuste)
    {
        return response()->json($ajuste->load($this->relaciones()));
    }

    public function update(Request $request, AjusteInventario $ajuste)
    {
        AlmacenAcceso::exigir($ajuste->almacen_id);

        // El ajuste ya movió stock al crearse, así que solo se editan los datos
        // descriptivos. Cambiar almacén, tipo o cantidades exigiría revertir y
        // volver a aplicar: para eso se elimina y se crea de nuevo.
        $data = $request->validate([
            'estado' => 'nullable|in:pendiente,aprobado,rechazado',
            'observaciones' => 'nullable|string',
        ]);
        $ajuste->update($data);
        return response()->json($ajuste);
    }

    /**
     * Costo de una unidad de la presentación: por defecto el del catálogo de
     * productos (su precio de compra). Si el catálogo no lo tiene, el costo
     * promedio real del inventario en ese almacén.
     */
    private function costoDe(ProductoPresentacion $presentacion, Almacen $almacen): float
    {
        $catalogo = (float) $presentacion->precio_compra;
        if ($catalogo > 0) {
            return round($catalogo, 4);
        }

        $factor = (float) $presentacion->factor_conversion ?: 1;

        $promedioBase = (float) ProductoAlmacenStock::where('producto_id', $presentacion->producto_id)
            ->where('almacen_id', $almacen->id)
            ->value('costo_promedio');

        return round($promedioBase * $factor, 4);
    }

    /**
     * Lo que el ajuste hizo con los rollos, deshecho. Una salida devuelve los
     * metros a su rollo. Una entrada borra los rollos que creó, pero solo si
     * siguen tal cual nacieron: si ya se separaron, cortaron o vendieron, el
     * ajuste no se puede eliminar sin descuadrar esos documentos.
     */
    private function revertirRollos(AjusteInventario $ajuste, AjusteDetalle $detalle, ProductoPresentacion $presentacion, RolloService $rollos): void
    {
        if ($detalle->rollo_id) {
            $rollo = Rollo::find($detalle->rollo_id);
            if ($rollo) {
                $metros = $presentacion->aMetros((float) $detalle->cantidad);

                if ($ajuste->tipo === 'entrada') {
                    // Se le habían sumado metros al rollo: deshacerlo es quitárselos, y solo se puede si aún los tiene.
                    try {
                        $rollos->cortar($rollo, $metros, RolloMovimiento::CANCELACION, 'ajuste_inventario', $ajuste->id, auth()->id());
                    } catch (\DomainException) {
                        throw new \RuntimeException("No se puede eliminar el ajuste: el rollo {$rollo->codigo} ya no tiene esos {$metros} m (se usaron o se cortó).");
                    }
                } else {
                    $rollos->devolver($rollo, $metros, RolloMovimiento::CANCELACION, 'ajuste_inventario', $ajuste->id, auth()->id());
                }
            }

            return;
        }

        $creados = Rollo::where('ajuste_detalle_id', $detalle->id)->get();
        foreach ($creados as $rollo) {
            if ($rollo->estado !== Rollo::DISPONIBLE || (float) $rollo->metros_actual !== (float) $rollo->metros_inicial) {
                throw new \RuntimeException("No se puede eliminar el ajuste: el rollo {$rollo->codigo} ya se usó (está {$rollo->estado}, con {$rollo->metros_actual} m).");
            }
        }
        foreach ($creados as $rollo) {
            $rollo->delete();
        }
    }

    /** Correlativo formal del ajuste, ej. AJ01-0001. */
    private function siguienteNumero(string $serie, ?int $almacenId = null): string
    {
        $serieDoc = SerieDocumento::where('tipo_documento', 'ajuste_inventario')
            ->where('serie', $serie)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'ajuste_inventario', 'serie' => $serie],
                ['numero_actual' => 0, 'activo' => true, 'almacen_id' => $almacenId]
            );

        $serieDoc->increment('numero_actual');

        return str_pad($serieDoc->numero_actual, 4, '0', STR_PAD_LEFT);
    }

    /**
     * ¿Se puede deshacer este ajuste? Solo si lo que movió sigue como lo dejó: un rollo que ingresó y luego se vendió,
     * se trasladó, se separó o se cortó, o un stock que ya se usó, impide eliminarlo hasta anular ese último movimiento.
     * Lanza con el detalle de qué rollos o productos lo impiden.
     */
    private function exigirReversible(AjusteInventario $ajuste): void
    {
        $ajuste->loadMissing('detalles');
        $impiden = [];

        foreach ($ajuste->detalles as $detalle) {
            $presentacion = ProductoPresentacion::with('producto')->find($detalle->producto_presentacion_id);

            // Los rollos que este ajuste creó (entrada de telas).
            foreach (Rollo::where('ajuste_detalle_id', $detalle->id)->get() as $rollo) {
                $motivo = null;
                if ((int) $rollo->almacen_id !== (int) $ajuste->almacen_id) {
                    $motivo = 'ya se trasladó a otro almacén';
                } elseif ($rollo->estado !== Rollo::DISPONIBLE) {
                    $motivo = "está {$rollo->estado}";
                } elseif ((float) $rollo->metros_actual !== (float) $rollo->metros_inicial) {
                    $motivo = 'ya se cortó o se ajustó su metraje';
                } elseif (RolloMovimiento::where('rollo_id', $rollo->id)->where('tipo', '!=', RolloMovimiento::INGRESO)->exists()) {
                    $motivo = 'tiene movimientos posteriores';
                }
                if ($motivo) {
                    $impiden[] = "el rollo {$rollo->codigo} {$motivo}";
                }
            }

            // Un rollo que ya existía: no debe haber tenido movimientos después de este ajuste.
            if ($detalle->rollo_id) {
                $rollo = Rollo::find($detalle->rollo_id);
                $ultimoDelAjuste = RolloMovimiento::where('rollo_id', $detalle->rollo_id)
                    ->where('documento_tipo', 'ajuste_inventario')->where('documento_id', $ajuste->id)->max('id');
                if ($rollo && $ultimoDelAjuste
                    && RolloMovimiento::where('rollo_id', $detalle->rollo_id)->where('id', '>', $ultimoDelAjuste)->exists()) {
                    $impiden[] = "el rollo {$rollo->codigo} tuvo movimientos después de este ajuste (venta, traslado, corte…)";
                }

                continue;
            }

            // Un producto común que entró: para deshacerlo tiene que seguir en el almacén.
            if ($ajuste->tipo === 'entrada' && $presentacion && ! Rollo::where('ajuste_detalle_id', $detalle->id)->exists()) {
                $factor = (float) $presentacion->factor_conversion ?: 1;
                $hay = (float) \App\Models\ProductoAlmacenStock::where('producto_id', $presentacion->producto_id)
                    ->where('almacen_id', $ajuste->almacen_id)->value('stock_actual');
                $nombre = $presentacion->producto?->nombre ?? 'El producto';
                if (! $presentacion->producto?->esTela() && (float) $detalle->cantidad * $factor > $hay + 0.001) {
                    $impiden[] = "de \"{$nombre}\" ya no queda en el almacén lo que este ajuste ingresó (se vendió o se trasladó)";
                }
            }
        }

        if ($impiden) {
            $lista = array_slice($impiden, 0, 6);
            $mas = count($impiden) > 6 ? ' y '.(count($impiden) - 6).' más' : '';
            throw new \RuntimeException(
                "No se puede eliminar el ajuste {$ajuste->serie}-{$ajuste->numero}: ".implode('; ', $lista).$mas
                .'. Anula primero ese último movimiento y vuelve a intentarlo.'
            );
        }
    }

    /**
     * Eliminar revierte el stock que el ajuste movió: si no, la mercadería
     * quedaría sumada o restada sin ningún documento que lo respalde.
     */
    public function destroy(AjusteInventario $ajuste)
    {
        AlmacenAcceso::exigir($ajuste->almacen_id);

        try {
            // Antes de tocar nada: si lo que el ajuste ingresó ya tuvo otros movimientos (vendido, trasladado, cortado),
            // deshacerlo ahora descuadraría el stock. Se avisa qué hay que anular primero.
            $this->exigirReversible($ajuste);

            DB::transaction(function () use ($ajuste) {
                $ajuste->load('detalles');
                $almacen = Almacen::findOrFail($ajuste->almacen_id);
                $stock = app(StockService::class);
                $rollos = app(RolloService::class);

                foreach ($ajuste->detalles as $detalle) {
                    $presentacion = ProductoPresentacion::with('producto.presentaciones.unidadBase')->findOrFail($detalle->producto_presentacion_id);
                    $cantidad = (float) $detalle->cantidad;

                    $this->revertirRollos($ajuste, $detalle, $presentacion, $rollos);

                    // Movimiento inverso al que hizo el ajuste.
                    $args = [$presentacion, $almacen, $cantidad, 0, 'ajuste_manual', 'ajuste_inventario', $ajuste->id, auth()->id()];
                    $ajuste->tipo === 'salida' ? $stock->entrada(...$args) : $stock->salida(...$args);
                }

                $ajuste->detalles()->delete();
                $ajuste->delete();
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Eliminado']);
    }
}
