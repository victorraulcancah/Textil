<?php

namespace App\Http\Controllers;

use App\Exceptions\ExcesoCreditoException;
use App\Http\Requests\NotaVenta\AnularNotaVentaRequest;
use App\Http\Requests\NotaVenta\StoreNotaVentaRequest;
use App\Http\Resources\NotaVentaResource;
use App\Models\CuentaPorCobrar;
use App\Models\CuentaPorCobrarPago;
use App\Models\MovimientoCaja;
use App\Models\NotaVenta;
use App\Services\NotaVentaService;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class NotaVentaController extends Controller
{
    public function __construct(
        protected NotaVentaService $notaVentaService
    ) {}

    public function index()
    {
        $notas = NotaVenta::with(['cliente', 'almacen', 'vendedor', 'ordenVenta:id,serie,numero', 'detalles.presentacion.producto.marca', 'detalles.presentacion.unidadBase', 'detalles.presentacion.producto.presentaciones.unidadBase', 'detalles.rollo.color', 'pagos.metodoPago'])
            ->orderBy('created_at', 'desc')
            ->paginate(15);

        return NotaVentaResource::collection($notas);
    }

    /**
     * Las reglas del negocio (stock insuficiente, rollo agotado, rollo que no
     * es de ese producto…) llegan como excepciones del servicio. Se devuelven
     * como 422 con su mensaje para que la pantalla diga qué pasó, en vez de un
     * error 500 genérico.
     */
    public function store(StoreNotaVentaRequest $request)
    {
        try {
            // Vende desde su almacén: ahí se numera (PF01, PF02…) y de ahí sale el stock.
            $datos = $request->validated();
            $datos['almacen_id'] = AlmacenAcceso::resolver((int) $datos['almacen_id']);
            $nota = $this->notaVentaService->crear($datos);
        } catch (ExcesoCreditoException $e) {
            return $this->excesoDeCredito($e);
        } catch (\DomainException|\RuntimeException|\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return new NotaVentaResource($nota);
    }

    /**
     * Edita una venta emitida. El servicio revierte el efecto anterior (stock,
     * caja, cuenta por cobrar y rollos) y vuelve a aplicarlo con los datos nuevos.
     */
    public function update(StoreNotaVentaRequest $request, NotaVenta $notaVenta)
    {
        try {
            AlmacenAcceso::exigir($notaVenta->almacen_id);
            $datos = $request->validated();
            $datos['almacen_id'] = AlmacenAcceso::resolver((int) $datos['almacen_id']);
            $nota = $this->notaVentaService->actualizar($notaVenta, $datos);
        } catch (ExcesoCreditoException $e) {
            return $this->excesoDeCredito($e);
        } catch (\DomainException|\RuntimeException|\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return new NotaVentaResource($nota);
    }

    public function show(NotaVenta $notaVenta)
    {
        return new NotaVentaResource(
            $notaVenta->load(['cliente', 'almacen', 'vendedor', 'detalles.presentacion.producto.marca', 'detalles.presentacion.unidadBase', 'detalles.presentacion.producto.presentaciones.unidadBase', 'detalles.rollo.color', 'pagos.metodoPago'])
        );
    }

    public function anular(AnularNotaVentaRequest $request, NotaVenta $notaVenta)
    {
        AlmacenAcceso::exigir($notaVenta->almacen_id);

        try {
            $nota = $this->notaVentaService->anular($notaVenta, $request->validated()['motivo_anulacion']);
            return new NotaVentaResource($nota);
        } catch (\DomainException|\RuntimeException|\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /**
     * La venta a crédito no cabe en la línea del cliente: el mensaje y los
     * números, para que la pantalla ofrezca autorizarla a quien puede.
     */
    private function excesoDeCredito(ExcesoCreditoException $e)
    {
        return response()->json(['message' => $e->getMessage(), 'exceso_credito' => $e->detalle], 422);
    }

    /**
     * Corrige el día de la proforma. Se mueven con ella los cobros de ese mismo día (y sus ingresos en caja), para que
     * la venta y su cobro sigan juntos; el día en que se registró de verdad (created_at) no cambia. Cualquier día hasta
     * hoy, y nunca después de un cobro posterior ni del vencimiento de una cuota.
     */
    public function cambiarFecha(Request $request, NotaVenta $notaVenta)
    {
        AlmacenAcceso::exigir($notaVenta->almacen_id);

        $data = $request->validate(['fecha' => 'required|date|before_or_equal:today']);
        $nueva = Carbon::parse($data['fecha'])->toDateString();

        if ($notaVenta->estado !== 'emitida') {
            return response()->json(['message' => 'La proforma está anulada: su fecha no se cambia.'], 422);
        }

        $vieja = $notaVenta->fecha_emision->toDateString();

        DB::transaction(function () use ($notaVenta, $nueva, $vieja) {
            // Los cobros y movimientos del mismo día de la venta se van con ella.
            $notaVenta->pagos()->whereDate('fecha', $vieja)->update(['fecha' => $nueva]);
            MovimientoCaja::where('documento_referencia_tipo', 'nota_venta')
                ->where('documento_referencia_id', $notaVenta->id)
                ->whereDate('fecha', $vieja)
                ->update(['fecha' => $nueva]);

            // Lo que no se movió no puede quedar antes de la venta.
            $cobro = $notaVenta->pagos()->whereDate('fecha', '<', $nueva)->orderBy('fecha')->first();
            if ($cobro) {
                throw ValidationException::withMessages(['fecha' => 'Hay un cobro del '.$cobro->fecha->format('d/m/Y').': la venta no puede ser después.']);
            }

            $cuenta = CuentaPorCobrar::where('nota_venta_id', $notaVenta->id)->whereDate('fecha_vencimiento', '<', $nueva)->orderBy('fecha_vencimiento')->first();
            if ($cuenta) {
                throw ValidationException::withMessages(['fecha' => 'Una cuota vence el '.$cuenta->fecha_vencimiento->format('d/m/Y').': la venta no puede ser después.']);
            }

            $cobranza = CuentaPorCobrarPago::whereHas('cuentaPorCobrar', fn ($q) => $q->where('nota_venta_id', $notaVenta->id))
                ->whereDate('fecha', '<', $nueva)->orderBy('fecha')->first();
            if ($cobranza) {
                throw ValidationException::withMessages(['fecha' => 'Hay una cobranza del '.$cobranza->fecha->format('d/m/Y').': la venta no puede ser después.']);
            }

            $notaVenta->update(['fecha_emision' => $nueva]);
        });

        return new NotaVentaResource($notaVenta->fresh()->load(['cliente', 'almacen', 'vendedor']));
    }

    public function destroy(NotaVenta $notaVenta)
    {
        AlmacenAcceso::exigir($notaVenta->almacen_id);
        $notaVenta->delete();
        return response()->json(['message' => 'Proforma eliminada correctamente']);
    }
}
