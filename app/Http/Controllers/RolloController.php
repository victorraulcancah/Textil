<?php

namespace App\Http\Controllers;

use App\Http\Requests\Rollo\IngresarRollosRequest;
use App\Http\Requests\Rollo\TrasladarRolloRequest;
use App\Http\Resources\RolloResource;
use App\Models\Almacen;
use App\Models\Producto;
use App\Models\ProductoColor;
use App\Models\RecepcionCompra;
use App\Models\Rollo;
use App\Services\RolloService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Los rollos: stock general, stock por color, consulta por código y el
 * ingreso masivo desde el packing list.
 */
class RolloController extends Controller
{
    /** Relaciones que acompañan a un rollo en las respuestas. */
    private const RELACIONES = ['producto:id,codigo,nombre', 'color', 'almacen:id,nombre', 'cliente:id,nombre'];

    public function __construct(private RolloService $rollos) {}

    /**
     * Listado filtrable: es la pantalla "Stock por color" y también la
     * búsqueda por rango de metraje ("un azul entre 50 y 70 m").
     */
    public function index(Request $request)
    {
        $rollos = Rollo::with(self::RELACIONES)
            ->when($request->filled('producto_id'), fn ($q) => $q->where('producto_id', $request->producto_id))
            ->when($request->filled('producto_color_id'), fn ($q) => $q->where('producto_color_id', $request->producto_color_id))
            ->when($request->filled('almacen_id'), fn ($q) => $q->where('almacen_id', $request->almacen_id))
            ->when($request->filled('estado'), fn ($q) => $q->where('estado', $request->estado))
            ->when($request->boolean('solo_disponibles'), fn ($q) => $q->disponibles())
            ->entreMetros($request->input('metros_desde'), $request->input('metros_hasta'))
            ->when($request->filled('buscar'), function ($q) use ($request) {
                $texto = $request->input('buscar');
                $q->where(fn ($sub) => $sub
                    ->where('codigo', 'like', "%{$texto}%")
                    ->orWhere('codigo_proveedor', 'like', "%{$texto}%"));
            })
            ->orderBy('producto_id')
            ->orderBy('producto_color_id')
            ->orderBy('numero')
            ->get();

        return RolloResource::collection($rollos)->toArray($request);
    }

    /**
     * Resumen por tela y color: la pantalla "Stock general".
     *
     * Devuelve cuántos rollos y cuántos metros hay de cada color, que es lo
     * primero que quiere ver la gerencia al abrir el sistema.
     */
    public function resumen(Request $request): JsonResponse
    {
        $filas = Rollo::query()
            ->selectRaw('producto_id, producto_color_id, estado, count(*) as rollos, sum(metros_actual) as metros, sum(metros_actual * costo_unitario) as valor')
            ->when($request->filled('almacen_id'), fn ($q) => $q->where('almacen_id', $request->almacen_id))
            ->when($request->filled('producto_id'), fn ($q) => $q->where('producto_id', $request->producto_id))
            ->groupBy('producto_id', 'producto_color_id', 'estado')
            ->with(['producto:id,codigo,nombre', 'color:id,nombre,codigo,hex'])
            ->get();

        // Se agrupa en PHP para devolver una fila por color con el desglose
        // por estado dentro: es como se pinta la tabla.
        $resumen = $filas
            ->groupBy(fn ($f) => $f->producto_id.'-'.$f->producto_color_id)
            ->map(function ($grupo) {
                $primera = $grupo->first();

                return [
                    'producto_id' => $primera->producto_id,
                    'producto' => $primera->producto?->nombre,
                    'producto_codigo' => $primera->producto?->codigo,
                    'producto_color_id' => $primera->producto_color_id,
                    'color' => $primera->color?->nombre,
                    'color_codigo' => $primera->color?->codigo,
                    'color_hex' => $primera->color?->hex,
                    'rollos' => (int) $grupo->sum('rollos'),
                    'metros' => round((float) $grupo->sum('metros'), 2),
                    'valor' => round((float) $grupo->sum('valor'), 2),
                    'por_estado' => $grupo->mapWithKeys(fn ($f) => [
                        $f->estado => [
                            'rollos' => (int) $f->rollos,
                            'metros' => round((float) $f->metros, 2),
                        ],
                    ]),
                ];
            })
            ->values();

        return response()->json([
            'resumen' => $resumen,
            'totales' => [
                'rollos' => (int) $resumen->sum('rollos'),
                'metros' => round((float) $resumen->sum('metros'), 2),
                'valor' => round((float) $resumen->sum('valor'), 2),
            ],
        ]);
    }

    public function show(Rollo $rollo)
    {
        return new RolloResource(
            $rollo->load([...self::RELACIONES, 'movimientos.usuario:id,name'])
        );
    }

    /**
     * Consulta por código: lo que responde el sistema cuando el almacenero
     * escanea la etiqueta de un rollo.
     */
    public function porCodigo(string $codigo)
    {
        $rollo = Rollo::with([...self::RELACIONES, 'movimientos.usuario:id,name'])
            ->where('codigo', $codigo)
            ->first();

        if (! $rollo) {
            return response()->json([
                'message' => "No existe ningún rollo con el código {$codigo}.",
            ], 404);
        }

        return new RolloResource($rollo);
    }

    /**
     * Ingreso masivo: se pegan los metrajes del packing list y el sistema
     * crea los rollos numerados y codificados.
     */
    public function ingresar(IngresarRollosRequest $request): JsonResponse
    {
        $data = $request->validated();

        $creados = $this->rollos->ingresar(
            Producto::findOrFail($data['producto_id']),
            isset($data['producto_color_id']) ? ProductoColor::find($data['producto_color_id']) : null,
            Almacen::findOrFail($data['almacen_id']),
            $request->lineas(),
            (float) ($data['costo_unitario'] ?? 0),
            isset($data['recepcion_compra_id']) ? RecepcionCompra::find($data['recepcion_compra_id']) : null,
            $data['codigo_proveedor'] ?? null,
        );

        return response()->json([
            'message' => "Se crearon {$creados->count()} rollos con ".round($creados->sum('metros_inicial'), 2).' m en total.',
            'rollos' => RolloResource::collection($creados->load(self::RELACIONES))->toArray($request),
        ], 201);
    }

    /** Cambia el rollo de rack o de almacén. */
    public function trasladar(TrasladarRolloRequest $request, Rollo $rollo)
    {
        $this->rollos->trasladar($rollo, $request->validated());

        return new RolloResource($rollo->fresh()->load(self::RELACIONES));
    }
}
