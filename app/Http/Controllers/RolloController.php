<?php

namespace App\Http\Controllers;

use App\Http\Requests\Rollo\IngresarRollosRequest;
use App\Http\Requests\Rollo\TrasladarRolloRequest;
use App\Http\Resources\RolloResource;
use App\Models\Almacen;
use App\Models\Producto;
use App\Models\ProductoColor;
use App\Models\RecepcionCompra;
use App\Models\MotivoMovimiento;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use App\Pdf\Documentos\EtiquetaRolloPdf;
use App\Pdf\PdfService;
use App\Services\AjusteRolloService;
use App\Services\RolloService;
use App\Support\AlmacenAcceso;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Los rollos: stock general, stock por color, consulta por código y el
 * ingreso masivo desde el packing list.
 */
class RolloController extends Controller
{
    /** Relaciones que acompañan a un rollo en las respuestas. */
    private const RELACIONES = [
        'producto:id,codigo,nombre', 'color', 'almacen:id,nombre', 'cliente:id,nombre',
        'importacion:id,codigo,documento,fecha_llegada',
        // La orden de compra de la que viene el rollo: la de su recepción o, si no, la de la compra recibida.
        'recepcion:id,orden_compra_id,compra_id', 'recepcion.ordenCompra:id,codigo', 'recepcion.compra:id,orden_compra_id', 'recepcion.compra.ordenCompra:id,codigo',
        'cortesPendientes.detalle.ordenVenta:id,serie,numero,estado',
        // Hasta 5 niveles: piso → pasillo → rack → nivel → posición.
        'ubicacion.padre.padre.padre.padre',
    ];

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
            ->when($request->filled('importacion_id'), fn ($q) => $q->where('importacion_id', $request->importacion_id))
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
            ->with(['producto:id,codigo,nombre,tipo_tela_id', 'producto.tipoTela:id,nombre,codigo,familia_tela_id', 'producto.tipoTela.familia:id,nombre', 'color:id,nombre,codigo,hex'])
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
                    // El tipo de tela (la agrupación con la que abre la pantalla de stock por rollo).
                    'tipo_tela_id' => $primera->producto?->tipo_tela_id,
                    'tipo_tela' => $primera->producto?->tipoTela?->nombre,
                    'tipo_tela_codigo' => $primera->producto?->tipoTela?->codigo,
                    'familia' => $primera->producto?->tipoTela?->familia?->nombre,
                    // El código del producto con color: familia-tipo-color (01-01-001).
                    'codigo_completo' => collect([$primera->producto?->codigo, $primera->color?->codigo])->filter()->implode('-'),
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
                            'valor' => round((float) $f->valor, 2),
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

        // Se recargan desde la base porque el servicio devuelve una colección
        // simple, sin las relaciones que necesita la respuesta.
        $rollos = Rollo::with(self::RELACIONES)
            ->whereIn('id', $creados->pluck('id'))
            ->orderBy('numero')
            ->get();

        return response()->json([
            'message' => "Se crearon {$creados->count()} rollos con ".round($creados->sum('metros_inicial'), 2).' m en total.',
            'rollos' => RolloResource::collection($rollos)->toArray($request),
        ], 201);
    }

    /**
     * Imprime las etiquetas de varios rollos de una vez.
     *
     * Al llegar una importación hay que etiquetar 93 rollos: hacerlo de uno en
     * uno no es viable. Se puede pedir por ids sueltos o por color entero, que
     * es como se etiqueta en la práctica.
     */
    public function etiquetas(Request $request)
    {
        $rollos = Rollo::with(['producto:id,codigo,nombre', 'color', 'almacen:id,nombre'])
            ->when($request->filled('ids'), fn ($q) => $q->whereIn('id', array_filter(explode(',', (string) $request->input('ids')))))
            ->when($request->filled('producto_id'), fn ($q) => $q->where('producto_id', $request->producto_id))
            ->when($request->filled('producto_color_id'), fn ($q) => $q->where('producto_color_id', $request->producto_color_id))
            ->when($request->filled('recepcion_compra_id'), fn ($q) => $q->where('recepcion_compra_id', $request->recepcion_compra_id))
            ->orderBy('numero')
            ->get();

        if ($rollos->isEmpty()) {
            return response()->json(['message' => 'No hay rollos que etiquetar con ese filtro.'], 404);
        }

        $documento = app(EtiquetaRolloPdf::class);

        $pdf = app(PdfService::class)->generarVista(
            $documento->vista(),
            ['etiquetas' => $rollos->map(fn ($r) => $documento->etiqueta($r))->all()],
            'etiqueta',
        );

        $archivo = 'etiquetas-'.$rollos->count().'-rollos.pdf';

        return $request->boolean('descargar') ? $pdf->download($archivo) : $pdf->stream($archivo);
    }

    /** Los motivos con los que se puede confirmar la pérdida de un rollo en revisión (los de salida de Ajustes). */
    public function motivosAjuste()
    {
        return response()->json(
            MotivoMovimiento::where('ambito', 'inventario')->where('tipo', 'salida')
                ->where('activo', true)->where('es_sistema', false)->whereNull('categoria_gasto')
                ->orderBy('id')->get(['id', 'nombre'])
        );
    }

    /** Un rollo "en revisión" (no se encontró al preparar un pedido) apareció: vuelve a estar disponible. */
    public function revisionAparecio(Rollo $rollo)
    {
        AlmacenAcceso::exigir($rollo->almacen_id);
        if ($rollo->estado !== Rollo::EN_REVISION) {
            throw new \DomainException('Este rollo no está en revisión.');
        }

        $this->rollos->cambiarEstado(
            $rollo,
            (float) $rollo->metros_actual > 0 ? Rollo::DISPONIBLE : Rollo::AGOTADO,
            RolloMovimiento::REVISION,
            'revision',
            null,
            auth()->id(),
            'Apareció: vuelve a estar disponible.',
        );

        return new RolloResource($rollo->fresh()->load(self::RELACIONES));
    }

    /**
     * Se confirma que el rollo en revisión se perdió: se registra el ajuste de inventario (salida de todo su metraje,
     * con su motivo) y el rollo queda agotado. Es un paso aparte de la entrega del pedido, que ya salió sin él.
     */
    public function revisionPerdido(Request $request, Rollo $rollo, AjusteRolloService $ajustes)
    {
        AlmacenAcceso::exigir($rollo->almacen_id);
        $datos = $request->validate([
            'motivo' => 'required|string|max:255',
            'observaciones' => 'nullable|string|max:500',
        ]);

        if ($rollo->estado !== Rollo::EN_REVISION) {
            throw new \DomainException('Este rollo no está en revisión.');
        }

        $motivo = MotivoMovimiento::where('ambito', 'inventario')->where('tipo', 'salida')
            ->where('activo', true)->where('es_sistema', false)->where('nombre', $datos['motivo'])->first();
        if (! $motivo) {
            return response()->json(['message' => 'Elige un motivo de ajuste válido.'], 422);
        }

        \Illuminate\Support\Facades\DB::transaction(function () use ($rollo, $motivo, $datos, $ajustes) {
            $ajustes->descontar(
                $rollo,
                (float) $rollo->metros_actual,
                $motivo->nombre,
                trim('Rollo '.$rollo->codigo.' perdido tras la revisión. '.($datos['observaciones'] ?? '')),
            );
        });

        return new RolloResource($rollo->fresh()->load(self::RELACIONES));
    }

    /** Cambia el rollo de rack o de almacén. */
    public function trasladar(TrasladarRolloRequest $request, Rollo $rollo)
    {
        $this->rollos->trasladar($rollo, $request->validated());

        return new RolloResource($rollo->fresh()->load(self::RELACIONES));
    }
}
