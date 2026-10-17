<?php

namespace App\Http\Controllers;

use App\Http\Requests\Cliente\GuardarClienteRequest;
use App\Models\Cliente;
use App\Services\ClienteHistorialService;
use App\Services\ClienteService;
use App\Services\CreditoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Clientes: recibe la petición, delega lo que se hace en los servicios y responde. Las reglas de lo que se acepta están
 * en `GuardarClienteRequest`.
 */
class ClienteController extends Controller
{
    public function __construct(
        private readonly ClienteService $clientes,
        private readonly ClienteHistorialService $historial,
        private readonly CreditoService $credito,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json($this->clientes->activosConEstadoCredito());
    }

    public function store(GuardarClienteRequest $request): JsonResponse
    {
        return response()->json($this->clientes->crear($request->validated()), 201);
    }

    public function show(Cliente $cliente): JsonResponse
    {
        return response()->json($cliente->load(ClienteService::RELACIONES));
    }

    public function update(GuardarClienteRequest $request, Cliente $cliente): JsonResponse
    {
        return response()->json($this->clientes->actualizar($cliente, $request->validated()));
    }

    public function destroy(Cliente $cliente): JsonResponse
    {
        $this->clientes->desactivar($cliente);

        return response()->json(['message' => 'Cliente desactivado correctamente']);
    }

    /** La línea de crédito en uso: lo aprobado, lo que debe y lo disponible hoy. */
    public function credito(Cliente $cliente): JsonResponse
    {
        return response()->json([
            'linea' => $cliente->lineaCredito,
            'resumen' => $this->credito->resumen($cliente),
        ]);
    }

    /** Las proformas y los pedidos del cliente, de lo más reciente a lo más antiguo. Sin fechas, todo. */
    public function documentos(Request $request, Cliente $cliente): JsonResponse
    {
        $fechas = $request->validate([
            'desde' => 'nullable|date',
            'hasta' => 'nullable|date|after_or_equal:desde',
        ]);

        return response()->json($this->historial->documentos($cliente, $fechas['desde'] ?? null, $fechas['hasta'] ?? null));
    }

    /** Lo que compra el cliente en los últimos meses (3, 6, 12 o 24). */
    public function estadistica(Request $request, Cliente $cliente): JsonResponse
    {
        $meses = (int) ($request->validate(['meses' => 'nullable|integer|in:3,6,12,24'])['meses'] ?? 12);

        return response()->json($this->historial->estadistica($cliente, $meses));
    }

    /** ⚫ Bloquea el crédito del cliente hasta que se desbloquee. */
    public function bloquearCredito(Request $request, Cliente $cliente): JsonResponse
    {
        $data = $request->validate(
            ['motivo' => 'required|string|max:500'],
            ['motivo.required' => 'Escribe por qué se bloquea el crédito.'],
        );

        return response()->json(['resumen' => $this->clientes->bloquearCredito($cliente, $data['motivo'], $request->user()->id)]);
    }

    /** Quita el bloqueo del crédito. */
    public function desbloquearCredito(Cliente $cliente): JsonResponse
    {
        return response()->json(['resumen' => $this->clientes->desbloquearCredito($cliente)]);
    }
}
