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
use Illuminate\Http\Request;
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
        'detalles.color:id,nombre,codigo,proveedor_id',
        'detalles.color.proveedor:id,nombre',
        'detalles.rollo:id,codigo',
    ];

    public function index()
    {
        return response()->json(
            AjusteInventario::with(self::RELACIONES)->withCount('detalles')->latest('id')->get()
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
            'detalles' => 'required|array|min:1',
            // Cada línea es de uno de tres tipos:
            //  · común: una presentación y su cantidad;
            //  · tela, entrada: los rollos de un color (cuántos y de cuántos metros);
            //  · tela, salida: los metros que se sacan de un rollo.
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
            $esSalidaTela = ! empty($d['rollo_id']) && ! empty($d['metros']);
            $esEntradaTela = ! empty($d['producto_id']) && ! empty($d['rollos']) && ! empty($d['metros_por_rollo']);
            $esComun = ! empty($d['producto_presentacion_id']) && ! empty($d['cantidad']);

            if (! $esSalidaTela && ! $esEntradaTela && ! $esComun) {
                throw ValidationException::withMessages(["detalles.{$i}" => 'La línea está incompleta.']);
            }
            if ($esSalidaTela && $data['tipo'] !== 'salida') {
                throw ValidationException::withMessages(["detalles.{$i}" => 'Sacar metros de un rollo es una salida.']);
            }
            if ($esEntradaTela && $data['tipo'] !== 'entrada') {
                throw ValidationException::withMessages(["detalles.{$i}" => 'Agregar rollos es una entrada.']);
            }
        }

        try {
            $ajuste = DB::transaction(function () use ($data) {
                $ajuste = AjusteInventario::create([
                    'serie' => AjusteInventario::SERIE,
                    'numero' => $this->siguienteNumero(),
                    'almacen_id' => $data['almacen_id'],
                    'proveedor_id' => $data['proveedor_id'] ?? null,
                    'tipo' => $data['tipo'],
                    'motivo' => $data['motivo'],
                    'observaciones' => $data['observaciones'] ?? null,
                    'estado' => 'aprobado',
                    'usuario_solicita_id' => auth()->id(),
                    'usuario_aprueba_id' => auth()->id(),
                    'fecha' => now(),
                ]);

                $almacen = Almacen::findOrFail($data['almacen_id']);
                $stock = app(StockService::class);
                $total = 0;

                $rollos = app(RolloService::class);

                foreach ($data['detalles'] as $detalle) {
                    $total += match (true) {
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
            $ajuste->load(self::RELACIONES),
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
        $args = [$presentacion, $almacen, $cantidad, 0, 'ajuste_manual', 'ajuste_inventario', $ajuste->id, auth()->id()];
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

        $stock->entrada($presentacion, $almacen, $cantidad, 0, 'ajuste_manual', 'ajuste_inventario', $ajuste->id, auth()->id());

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

        $stock->salida($presentacion, $almacen, $cantidad, 0, 'ajuste_manual', 'ajuste_inventario', $ajuste->id, auth()->id());

        return $subtotal;
    }

    public function show(AjusteInventario $ajuste)
    {
        return response()->json($ajuste->load(self::RELACIONES));
    }

    public function update(Request $request, AjusteInventario $ajuste)
    {
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
                $rollos->devolver(
                    $rollo,
                    $presentacion->aMetros((float) $detalle->cantidad),
                    RolloMovimiento::CANCELACION,
                    'ajuste_inventario',
                    $ajuste->id,
                    auth()->id(),
                );
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
    private function siguienteNumero(): string
    {
        $serieDoc = SerieDocumento::where('tipo_documento', 'ajuste_inventario')
            ->where('serie', AjusteInventario::SERIE)
            ->lockForUpdate()
            ->firstOrCreate(
                ['tipo_documento' => 'ajuste_inventario', 'serie' => AjusteInventario::SERIE],
                ['numero_actual' => 0, 'activo' => true]
            );

        $serieDoc->increment('numero_actual');

        return str_pad($serieDoc->numero_actual, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Eliminar revierte el stock que el ajuste movió: si no, la mercadería
     * quedaría sumada o restada sin ningún documento que lo respalde.
     */
    public function destroy(AjusteInventario $ajuste)
    {
        try {
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
