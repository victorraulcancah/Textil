<?php

namespace App\Http\Controllers;

use App\Http\Requests\OrdenVenta\AnularOrdenVentaRequest;
use App\Http\Requests\OrdenVenta\EscanearRolloRequest;
use App\Http\Requests\OrdenVenta\FacturarPedidoRequest;
use App\Http\Requests\OrdenVenta\StoreOrdenVentaRequest;
use App\Http\Requests\OrdenVenta\UpdateOrdenVentaRequest;
use App\Http\Resources\NotaVentaResource;
use App\Http\Resources\OrdenVentaResource;
use App\Models\OrdenVenta;
use App\Services\OrdenVentaService;
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
        'detalles.rollo.producto:id,codigo,nombre',
        'detalles.rollo.color',
        'detalles.presentacion:id,nombre',
    ];

    public function __construct(private OrdenVentaService $pedidos) {}

    public function index(Request $request)
    {
        $ordenes = OrdenVenta::with([
            'cliente:id,nombre',
            'almacen:id,nombre',
            'vendedor:id,name',
            'detalles',
        ])
            ->withCount('detalles')
            ->when($request->filled('estado'), fn ($q) => $q->where('estado', $request->estado))
            ->when($request->filled('cliente_id'), fn ($q) => $q->where('cliente_id', $request->cliente_id))
            ->when($request->filled('almacen_id'), fn ($q) => $q->where('almacen_id', $request->almacen_id))
            ->latest('id')
            ->get();

        return OrdenVentaResource::collection($ordenes)->toArray($request);
    }

    public function show(OrdenVenta $ordenesVenta)
    {
        return new OrdenVentaResource($ordenesVenta->load(self::RELACIONES));
    }

    public function store(StoreOrdenVentaRequest $request)
    {
        $orden = $this->pedidos->crear($request->validated());

        return (new OrdenVentaResource($orden->load(self::RELACIONES)))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UpdateOrdenVentaRequest $request, OrdenVenta $ordenesVenta)
    {
        $orden = $this->pedidos->actualizar($ordenesVenta, $request->validated());

        return new OrdenVentaResource($orden->load(self::RELACIONES));
    }

    /** Separa la tela: los rollos quedan reservados para este cliente. */
    public function separar(OrdenVenta $ordenesVenta)
    {
        return new OrdenVentaResource(
            $this->pedidos->separar($ordenesVenta)->load(self::RELACIONES)
        );
    }

    /** Devuelve el pedido a borrador y libera los rollos. */
    public function devolver(OrdenVenta $ordenesVenta)
    {
        return new OrdenVentaResource(
            $this->pedidos->devolverABorrador($ordenesVenta)->load(self::RELACIONES)
        );
    }

    /** Genera el requerimiento de almacén y avisa al almacenero. */
    public function preparar(OrdenVenta $ordenesVenta)
    {
        return new OrdenVentaResource(
            $this->pedidos->enviarAPreparacion($ordenesVenta)->load(self::RELACIONES)
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
        return response()->json(
            $this->pedidos->escanear($ordenesVenta, $request->validated()['codigo'])
        );
    }

    /** Los rollos salen del almacén. Exige haberlos escaneado todos. */
    public function despachar(OrdenVenta $ordenesVenta)
    {
        return new OrdenVentaResource(
            $this->pedidos->despachar($ordenesVenta)->load(self::RELACIONES)
        );
    }

    /** Anula el pedido y devuelve los rollos al stock disponible. */
    public function anular(AnularOrdenVentaRequest $request, OrdenVenta $ordenesVenta)
    {
        return new OrdenVentaResource(
            $this->pedidos->anular($ordenesVenta, $request->validated()['motivo'])->load(self::RELACIONES)
        );
    }

    /**
     * Emite la nota de venta del pedido despachado. Es el punto en el que por
     * fin se descuenta el stock y se cobra.
     */
    public function facturar(FacturarPedidoRequest $request, OrdenVenta $ordenesVenta)
    {
        $nota = $this->pedidos->facturar($ordenesVenta, $request->validated());

        return (new NotaVentaResource($nota))->response()->setStatusCode(201);
    }
}
