<?php

namespace App\Http\Controllers;

use App\Http\Requests\OrdenVenta\AnularOrdenVentaRequest;
use App\Http\Requests\OrdenVenta\EscanearRolloRequest;
use App\Http\Requests\OrdenVenta\FacturarPedidoRequest;
use App\Http\Requests\OrdenVenta\StoreOrdenVentaRequest;
use App\Http\Requests\OrdenVenta\UpdateOrdenVentaRequest;
use App\Http\Resources\NotaVentaResource;
use App\Http\Resources\OrdenVentaResource;
use App\Models\MotivoMovimiento;
use App\Models\OrdenVenta;
use App\Services\OrdenVentaService;
use App\Support\AlmacenAcceso;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Los pedidos: desde que se toman hasta que se despachan.
 *
 * Cada paso del recorrido es su propia acción, porque cada uno lo hace una
 * persona distinta: el vendedor separa, el almacenero prepara y despacha.
 */
class OrdenVentaController extends Controller
{
    private const RELACIONES = [
        'cliente:id,nombre',
        'almacen:id,nombre',
        'vendedor:id,name',
        'usuarioPrepara:id,name',
        'usuarioDespacha:id,name',
        'asignados:id,name',
        'detalles.presentacion.producto:id,codigo,nombre,tipo_tela_id',
        'detalles.presentacion.producto.tipoTela.familia',
        'detalles.color:id,nombre,codigo,hex',
        'detalles.almacenReserva:id,nombre',
        'detalles.rollos.rollo.color',
        // Quién escaneó cada rollo: varios almaceneros pueden preparar el
        // mismo pedido y se necesita saber quién trajo cuál.
        'detalles.rollos.usuario:id,name',
    ];

    public function __construct(private OrdenVentaService $pedidos) {}

    public function index(Request $request)
    {
        $ordenes = OrdenVenta::with([
            'cliente:id,nombre',
            'almacen:id,nombre',
            'vendedor:id,name',
            'asignados:id,name',
            'detalles.rollos',
        ])
            ->withCount('detalles')
            ->when($request->filled('estado'), fn ($q) => $q->where('estado', $request->estado))
            // La bandeja del almacén necesita dos estados a la vez: los que
            // están esperando y los que ya se están preparando. Ese filtro
            // ("estados", en plural) es justo lo que distingue a Despacho de
            // la pantalla de Pedidos del vendedor —Despacho nunca lo manda
            // solo—: por eso "ver solo lo mío" no se aplica ahí, o ningún
            // almacenero vería los pedidos de los demás vendedores.
            ->when($request->filled('estados'), fn ($q) => $q->whereIn(
                'estado',
                array_filter(explode(',', (string) $request->input('estados')))
            ))
            ->when(
                ! $request->filled('estados') && ! $this->puedeVerTodo($request),
                fn ($q) => $q->where('vendedor_id', $request->user()->id),
            )
            // La bandeja de Despacho solo trae lo del almacén en el que trabaja el usuario (más lo antiguo, que no tiene
            // almacén todavía). El Super Admin ve todos, o el que elija con el filtro.
            ->when(
                $request->filled('estados') && ! AlmacenAcceso::irrestricto(),
                fn ($q) => $q->where(fn ($w) => $w->where('almacen_id', AlmacenAcceso::propio() ?? 0)->orWhereNull('almacen_id')),
            )
            ->when($request->filled('cliente_id'), fn ($q) => $q->where('cliente_id', $request->cliente_id))
            ->when($request->filled('almacen_id') && AlmacenAcceso::irrestricto(), fn ($q) => $q->where('almacen_id', $request->almacen_id))
            ->latest('id')
            ->get();

        return OrdenVentaResource::collection($ordenes)->toArray($request);
    }

    /** El super-admin y quien tenga "ver todo" ven los pedidos de todos los vendedores. */
    private function puedeVerTodo(Request $request): bool
    {
        $user = $request->user();

        return $user->hasRole(config('permisos.super_admin')) || $user->can('ventas.pedidos.ver_todo');
    }

    public function show(OrdenVenta $ordenesVenta)
    {
        return new OrdenVentaResource($ordenesVenta->load(self::RELACIONES));
    }

    public function store(StoreOrdenVentaRequest $request)
    {
        // El pedido es del almacén de quien lo toma: ahí se reserva y ahí se prepara.
        $datos = $request->validated();
        $datos['almacen_id'] = AlmacenAcceso::resolver($request->filled('almacen_id') ? (int) $request->input('almacen_id') : null);
        if (! $datos['almacen_id']) {
            return response()->json(['message' => 'Elige el almacén del pedido: de ahí sale la mercadería.', 'errors' => ['almacen_id' => ['Elige el almacén del pedido.']]], 422);
        }
        $orden = $this->pedidos->crear($datos);

        return (new OrdenVentaResource($orden->load(self::RELACIONES)))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UpdateOrdenVentaRequest $request, OrdenVenta $ordenesVenta)
    {
        AlmacenAcceso::exigir($ordenesVenta->almacen_id);
        $orden = $this->pedidos->actualizar($ordenesVenta, $request->validated());

        return new OrdenVentaResource($orden->load(self::RELACIONES));
    }

    /**
     * El vendedor solicita el pedido al almacén: se numera el requerimiento,
     * los rollos quedan reservados y aparece en la bandeja del almacenero.
     */
    public function solicitar(OrdenVenta $ordenesVenta)
    {
        AlmacenAcceso::exigir($ordenesVenta->almacen_id);
        return new OrdenVentaResource(
            $this->pedidos->solicitar($ordenesVenta)->load(self::RELACIONES)
        );
    }

    /** Devuelve el pedido a borrador y libera los rollos. */
    public function devolver(OrdenVenta $ordenesVenta)
    {
        AlmacenAcceso::exigir($ordenesVenta->almacen_id);
        return new OrdenVentaResource(
            $this->pedidos->devolverABorrador($ordenesVenta)->load(self::RELACIONES)
        );
    }

    /**
     * El almacenero terminó de juntar los rollos: quedan apartados dentro del
     * almacén, verificados y esperando su salida.
     */
    public function separar(OrdenVenta $ordenesVenta)
    {
        AlmacenAcceso::exigir($ordenesVenta->almacen_id);
        return new OrdenVentaResource(
            $this->pedidos->marcarSeparado($ordenesVenta)->load(self::RELACIONES)
        );
    }

    /**
     * El almacenero escanea un rollo con la pistola.
     *
     * Responde 200 si el rollo corresponde, 422 con el aviso si no: la
     * pantalla lo pinta en verde o en rojo según eso.
     */
    public function escanear(EscanearRolloRequest $request, OrdenVenta $ordenesVenta): JsonResponse
    {
        AlmacenAcceso::exigir($ordenesVenta->almacen_id);
        return response()->json(
            $this->pedidos->escanear($ordenesVenta, $request->validated()['codigo'])
        );
    }

    /** A quién se le puede repartir un pedido: el personal con permiso de despacho. */
    public function almaceneros()
    {
        return response()->json($this->pedidos->almaceneros());
    }

    /**
     * El encargado reparte el pedido entre uno o varios almaceneros. Una lista
     * vacía lo deja sin asignar.
     */
    public function asignar(Request $request, OrdenVenta $ordenesVenta)
    {
        AlmacenAcceso::exigir($ordenesVenta->almacen_id);
        $datos = $request->validate([
            'usuarios' => 'present|array',
            'usuarios.*' => 'integer|exists:users,id',
        ]);

        return new OrdenVentaResource(
            $this->pedidos->asignar($ordenesVenta, $datos['usuarios'])->load(self::RELACIONES)
        );
    }

    /** Los rollos salen del almacén. Exige haberlos escaneado todos. */
    public function despachar(OrdenVenta $ordenesVenta)
    {
        AlmacenAcceso::exigir($ordenesVenta->almacen_id);
        return new OrdenVentaResource(
            $this->pedidos->despachar($ordenesVenta)->load(self::RELACIONES)
        );
    }

    /** Anula el pedido y devuelve los rollos al stock disponible. */
    public function anular(AnularOrdenVentaRequest $request, OrdenVenta $ordenesVenta)
    {
        AlmacenAcceso::exigir($ordenesVenta->almacen_id);
        return new OrdenVentaResource(
            $this->pedidos->anular($ordenesVenta, $request->validated()['motivo'])->load(self::RELACIONES)
        );
    }

    /** Los motivos con los que se puede descontar metraje de un rollo (los de salida de Ajustes). */
    public function motivosAjuste()
    {
        return response()->json(
            MotivoMovimiento::where('ambito', 'inventario')->where('tipo', 'salida')
                ->where('activo', true)->where('es_sistema', false)->whereNull('categoria_gasto')
                ->orderBy('id')->get(['id', 'nombre'])
        );
    }

    /** Agrega un motivo de salida de inventario (el mismo catálogo de Ajustes) sin salir de la preparación. */
    public function crearMotivoAjuste(Request $request)
    {
        $nombre = trim($request->validate(['nombre' => 'required|string|max:255'])['nombre']);

        $existe = MotivoMovimiento::where('ambito', 'inventario')->where('tipo', 'salida')
            ->whereRaw('lower(nombre) = ?', [mb_strtolower($nombre)])->exists();
        if ($existe) {
            return response()->json(['message' => 'Ese motivo ya existe.', 'errors' => ['nombre' => ['Ese motivo ya existe.']]], 422);
        }

        $motivo = MotivoMovimiento::create([
            'nombre' => $nombre,
            'origen' => 'Despacho',
            'tipo' => 'salida',
            'ambito' => 'inventario',
            'activo' => true,
        ]);

        return response()->json($motivo->only(['id', 'nombre']), 201);
    }

    /** Descuenta metros de un rollo del pedido, como ajuste de sistema con su motivo. */
    public function descontarMetraje(Request $request, OrdenVenta $ordenesVenta)
    {
        AlmacenAcceso::exigir($ordenesVenta->almacen_id);
        $datos = $request->validate([
            'rollo_id' => 'required|integer',
            'metros' => 'required|numeric|min:0.01',
            'motivo' => 'required|string|max:255',
            'observaciones' => 'nullable|string|max:500',
        ]);

        $motivo = MotivoMovimiento::where('ambito', 'inventario')->where('tipo', 'salida')
            ->where('activo', true)->where('es_sistema', false)->where('nombre', $datos['motivo'])->first();
        if (! $motivo) {
            return response()->json(['message' => 'Elige un motivo de ajuste válido.'], 422);
        }

        return new OrdenVentaResource(
            $this->pedidos->descontarMetraje($ordenesVenta, (int) $datos['rollo_id'], (float) $datos['metros'], $motivo->nombre, $datos['observaciones'] ?? null)
                ->load(self::RELACIONES)
        );
    }

    /** Quita un rollo que se asignó por error. */
    public function quitarRollo(Request $request, OrdenVenta $ordenesVenta)
    {
        AlmacenAcceso::exigir($ordenesVenta->almacen_id);
        $rolloId = (int) $request->validate(['rollo_id' => 'required|integer'])['rollo_id'];

        return new OrdenVentaResource(
            $this->pedidos->quitarRollo($ordenesVenta, $rolloId)->load(self::RELACIONES)
        );
    }

    /**
     * Emite la proforma del pedido despachado. Es el punto en el que por
     * fin se descuenta el stock y se cobra.
     */
    public function facturar(FacturarPedidoRequest $request, OrdenVenta $ordenesVenta)
    {
        AlmacenAcceso::exigir($ordenesVenta->almacen_id);
        $nota = $this->pedidos->facturar($ordenesVenta, $request->validated());

        return (new NotaVentaResource($nota))->response()->setStatusCode(201);
    }
}
