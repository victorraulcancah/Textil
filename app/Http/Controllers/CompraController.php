<?php

namespace App\Http\Controllers;

use App\Http\Requests\Compra\FinalizarCompraRequest;
use App\Http\Requests\Compra\StoreCompraRequest;
use App\Http\Requests\Compra\UpdateCompraRequest;
use App\Http\Resources\CompraResource;
use App\Models\Compra;
use App\Services\CompraConsultaService;
use App\Services\CompraService;
use Illuminate\Http\JsonResponse;

/**
 * Compras: recibe la petición, delega en los servicios y responde. Las reglas de lo que se acepta están en los
 * `FormRequest`, y lo que se hace con la compra en `CompraService`.
 */
class CompraController extends Controller
{
    /** Relaciones que acompañan a una compra en las respuestas de detalle. */
    private const RELACIONES = [
        'proveedor:id,nombre,tipo',
        'ordenCompra:id,codigo,proveedor_id,numero_proveedor,fecha_emision',
        'ordenCompra.proveedor:id,codigo_corto',
        'detalles.presentacion.producto',
        'detalles.color',
        'pagos',
        'gastos',
    ];

    public function __construct(
        private readonly CompraService $compras,
        private readonly CompraConsultaService $consulta,
    ) {}

    public function index()
    {
        // Sin envoltura "data": el listado se consume como array plano.
        return CompraResource::collection($this->consulta->listado())->toArray(request());
    }

    public function store(StoreCompraRequest $request): JsonResponse
    {
        $compra = $this->compras->registrar($request->validated());

        return CompraResource::make($compra->load(self::RELACIONES))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Compra $compra): CompraResource
    {
        return CompraResource::make($compra->load(self::RELACIONES));
    }

    public function update(UpdateCompraRequest $request, Compra $compra)
    {
        try {
            $compra = $this->compras->actualizar($compra, $request->validated());
        } catch (\DomainException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return CompraResource::make($compra->load(self::RELACIONES));
    }

    public function finalizar(FinalizarCompraRequest $request, Compra $compra)
    {
        try {
            $compra = $this->compras->finalizar($compra, $request->validated()['motivo']);
        } catch (\DomainException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return CompraResource::make($compra->load(['detalles', 'proveedor:id,nombre']));
    }

    public function anular(Compra $compra): CompraResource
    {
        return CompraResource::make($this->compras->anular($compra));
    }

    public function destroy(Compra $compra): JsonResponse
    {
        $this->compras->eliminar($compra);

        return response()->json(['message' => 'Eliminado']);
    }
}
