<?php

namespace App\Http\Controllers;

use App\Models\Transferencia;
use App\Services\RequerimientoTrasladoService;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;

/**
 * Requerimientos de traslado: un almacén (destino) le pide mercadería a otro (origen).
 *
 * Lo ve y lo atiende solo el personal del almacén PEDIDO (origen); quien lo pidió ve el estado de los suyos. El
 * Super Admin ve todo.
 */
class RequerimientoTrasladoController extends Controller
{
    private const ESTADOS_ABIERTOS = ['solicitada', 'preparando', 'separada'];

    public function __construct(private readonly RequerimientoTrasladoService $servicio)
    {
    }

    /**
     * `rol=atender`: lo que le piden a mi almacén. `rol=pedidos`: lo que mi almacén pidió. Sin rol, ambos
     * (el Super Admin ve todos).
     */
    public function index(Request $request)
    {
        $consulta = Transferencia::whereNotNull('requerimiento_serie')
            ->with(['almacenOrigen:id,nombre,numero_serie', 'almacenDestino:id,nombre,numero_serie', 'usuarioSolicita:id,name',
                'detalles.presentacion.producto', 'detalles.color', 'detalles.rollos'])
            ->latest('id');

        if (! AlmacenAcceso::irrestricto()) {
            $propio = AlmacenAcceso::propio();
            $rol = $request->query('rol');
            $consulta->where(function ($q) use ($propio, $rol) {
                if (! $propio) {
                    $q->whereRaw('1 = 0');

                    return;
                }
                if ($rol === 'atender') {
                    $q->where('almacen_origen_id', $propio);
                } elseif ($rol === 'pedidos') {
                    $q->where('almacen_destino_id', $propio);
                } else {
                    $q->where('almacen_origen_id', $propio)->orWhere('almacen_destino_id', $propio);
                }
            });
        } elseif ($almacen = $request->integer('almacen_id')) {
            $consulta->where(function ($q) use ($almacen, $request) {
                $request->query('rol') === 'pedidos'
                    ? $q->where('almacen_destino_id', $almacen)
                    : $q->where('almacen_origen_id', $almacen);
            });
        }

        if ($estado = $request->query('estado')) {
            $consulta->where('estado', $estado);
        }

        return response()->json($consulta->get()->map(fn (Transferencia $t) => $this->formato($t)));
    }

    public function show(Transferencia $transferencia)
    {
        $this->exigirVisible($transferencia);

        return response()->json($this->formato($this->servicio->cargar($transferencia)));
    }

    /** El destino es el almacén de quien pide; se pide a otro almacén (origen). */
    public function store(Request $request)
    {
        $data = $request->validate([
            'almacen_origen_id' => 'required|exists:almacenes,id',
            'almacen_destino_id' => 'nullable|exists:almacenes,id',
            'observaciones' => 'nullable|string|max:500',
            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.producto_color_id' => 'nullable|exists:producto_colores,id',
            'detalles.*.modo' => 'required|in:rollos,metros,cantidad',
            'detalles.*.rollos_pedidos' => 'required_if:detalles.*.modo,rollos|nullable|integer|min:1|max:9999',
            'detalles.*.metros_por_rollo' => 'nullable|numeric|min:0.01|max:9999',
            'detalles.*.metros_pedidos' => 'required_if:detalles.*.modo,metros|nullable|numeric|min:0.01',
            'detalles.*.cantidad' => 'required_if:detalles.*.modo,cantidad|nullable|numeric|min:0.01',
        ]);

        // Pide el almacén en el que trabaja; el Super Admin elige quién pide.
        $data['almacen_destino_id'] = AlmacenAcceso::resolver($data['almacen_destino_id'] ?? null);
        if (! $data['almacen_destino_id']) {
            return response()->json(['message' => 'Indica el almacén que pide la mercadería.'], 422);
        }
        if ((int) $data['almacen_destino_id'] === (int) $data['almacen_origen_id']) {
            return response()->json(['message' => 'El almacén que pide y el pedido deben ser distintos.'], 422);
        }

        return response()->json($this->formato($this->servicio->crear($data)), 201);
    }

    public function escanear(Request $request, Transferencia $transferencia)
    {
        $this->exigirAtencion($transferencia);
        $codigo = $request->validate(['codigo' => 'required|string|max:100'])['codigo'];

        return response()->json($this->servicio->escanear($transferencia, $codigo));
    }

    public function quitarRollo(Request $request, Transferencia $transferencia)
    {
        $this->exigirAtencion($transferencia);
        $rolloId = (int) $request->validate(['rollo_id' => 'required|integer'])['rollo_id'];

        return response()->json($this->formato($this->servicio->quitarRollo($transferencia, $rolloId)));
    }

    public function separar(Transferencia $transferencia)
    {
        $this->exigirAtencion($transferencia);

        return response()->json($this->formato($this->servicio->marcarSeparada($transferencia)));
    }

    /** Sale la mercadería: nace la guía y el traslado queda en tránsito hacia el almacén que lo pidió. */
    public function despachar(Request $request, Transferencia $transferencia)
    {
        $this->exigirAtencion($transferencia);
        $transporte = $request->validate([
            'modalidad_transporte' => 'nullable|in:privado,publico',
            'transportista_razon_social' => 'nullable|required_if:modalidad_transporte,publico|string|max:255',
            'transportista_ruc' => 'nullable|required_if:modalidad_transporte,publico|digits:11',
            'vehiculo_placa' => 'nullable|string|max:10',
            'conductor_nombre' => 'nullable|string|max:255',
            'conductor_documento' => 'nullable|string|max:15',
            'conductor_licencia' => 'nullable|string|max:15',
            'numero_bultos' => 'nullable|integer|min:0',
            'peso_bruto_kg' => 'nullable|numeric|min:0',
        ]);

        return response()->json($this->formato($this->servicio->despachar($transferencia, array_filter($transporte, fn ($v) => $v !== null))));
    }

    /** El almacén pedido no puede atenderlo. */
    public function rechazar(Request $request, Transferencia $transferencia)
    {
        $this->exigirAtencion($transferencia);
        $motivo = $request->validate(['motivo' => 'nullable|string|max:500'])['motivo'] ?? null;

        return response()->json($this->formato($this->servicio->cerrar($transferencia, 'rechazada', $motivo)));
    }

    /** El almacén que lo pidió lo cancela (mientras no haya salido). */
    public function anular(Transferencia $transferencia)
    {
        $this->exigirPedido($transferencia);

        return response()->json($this->formato($this->servicio->cerrar($transferencia, 'cancelada')));
    }

    /** Solo el almacén pedido (o el Super Admin) atiende. */
    private function exigirAtencion(Transferencia $t): void
    {
        $this->exigirRequerimiento($t);
        AlmacenAcceso::exigir($t->almacen_origen_id);
    }

    /** Solo el almacén que pidió (o el Super Admin) lo cancela. */
    private function exigirPedido(Transferencia $t): void
    {
        $this->exigirRequerimiento($t);
        AlmacenAcceso::exigir($t->almacen_destino_id);
    }

    /** Lo ven los dos almacenes involucrados; los demás no. */
    private function exigirVisible(Transferencia $t): void
    {
        $this->exigirRequerimiento($t);
        if (AlmacenAcceso::irrestricto()) {
            return;
        }
        $propio = AlmacenAcceso::propio();
        if (! $propio || ! in_array($propio, [(int) $t->almacen_origen_id, (int) $t->almacen_destino_id], true)) {
            abort(403, 'Este requerimiento es de otros almacenes.');
        }
    }

    private function exigirRequerimiento(Transferencia $t): void
    {
        if (! $t->esRequerimiento()) {
            abort(404, 'Ese traslado no es un requerimiento.');
        }
    }

    /** La forma que consume la pantalla. */
    private function formato(Transferencia $t): array
    {
        $t->loadMissing('detalles.rollos.rollo:id,codigo,metros_actual', 'detalles.presentacion.producto', 'detalles.color');
        $completo = $t->detalles->every(fn ($d) => $d->estaCubierta());

        return [
            'id' => $t->id,
            'requerimiento' => $t->requerimiento,
            'guia' => $t->documento,
            'estado' => $t->estado,
            'origen' => $t->almacenOrigen ? ['id' => $t->almacenOrigen->id, 'nombre' => $t->almacenOrigen->nombre] : null,
            'destino' => $t->almacenDestino ? ['id' => $t->almacenDestino->id, 'nombre' => $t->almacenDestino->nombre] : null,
            'solicitante' => $t->usuarioSolicita?->name,
            'fecha_solicitud' => $t->fecha_solicitud,
            'fecha_envio' => $t->fecha_envio,
            'fecha_recepcion' => $t->fecha_recepcion,
            'observaciones' => $t->observaciones,
            'motivo_rechazo' => $t->motivo_rechazo,
            'abierto' => in_array($t->estado, self::ESTADOS_ABIERTOS, true),
            'completo' => $completo,
            'detalles' => $t->detalles->map(fn ($d) => [
                'id' => $d->id,
                'modo' => $d->modo,
                'producto' => $d->presentacion?->producto?->nombre,
                'presentacion' => $d->presentacion?->nombre,
                'color' => $d->color?->nombre,
                'color_hex' => $d->color?->codigo_hex ?? null,
                'rollos_pedidos' => $d->rollos_pedidos,
                'metros_por_rollo' => $d->metros_por_rollo !== null ? (float) $d->metros_por_rollo : null,
                'metros_pedidos' => $d->metros_pedidos !== null ? (float) $d->metros_pedidos : null,
                'cantidad' => $d->modo === 'cantidad' ? (float) $d->cantidad_enviada : null,
                'cantidad_enviada' => (float) $d->cantidad_enviada,
                'cantidad_recibida' => $d->cantidad_recibida !== null ? (float) $d->cantidad_recibida : null,
                'cubierta' => $d->estaCubierta(),
                'rollos_asignados' => $d->rollos->count(),
                'metros_asignados' => $d->metrosAsignados(),
                'rollos' => $d->rollos->map(fn ($r) => [
                    'rollo_id' => $r->rollo_id,
                    'codigo' => $r->rollo?->codigo,
                    'metros' => (float) $r->metros,
                    'metros_rollo' => $r->metros_rollo !== null ? (float) $r->metros_rollo : null,
                    'entero' => (bool) $r->entero,
                ])->values(),
            ])->values(),
        ];
    }
}
