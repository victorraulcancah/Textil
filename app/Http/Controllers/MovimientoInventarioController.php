<?php

namespace App\Http\Controllers;

use App\Models\MovimientoInventario;
use App\Models\Producto;
use App\Models\ProductoColor;
use App\Models\RecepcionCompra;
use App\Models\Rollo;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MovimientoInventarioController extends Controller
{
    /**
     * Las telas que se pueden consultar en el kardex (para el buscador): las que tienen movimientos
     * o stock. Los movimientos de la tela elegida se piden aparte.
     */
    public function telas()
    {
        $movs = DB::table('movimientos_inventario')
            ->selectRaw('producto_id, count(*) as movimientos')
            ->groupBy('producto_id')
            ->pluck('movimientos', 'producto_id');

        $stock = DB::table('producto_almacen_stock')
            ->selectRaw('producto_id, sum(stock_actual) as stock')
            ->groupBy('producto_id')
            ->pluck('stock', 'producto_id');

        $ids = $movs->keys()->merge($stock->filter(fn ($v) => (float) $v > 0)->keys())->unique()->values();

        return response()->json(
            Producto::with(['unidadBase:id,abreviatura', 'tipoTela:id,nombre', 'marca:id,nombre'])
                ->whereIn('id', $ids)
                ->orderBy('nombre')
                ->get(['id', 'codigo', 'nombre', 'unidad_base_id', 'tipo_tela_id', 'marca_id'])
                ->map(fn (Producto $p) => [
                    'id' => $p->id,
                    'codigo' => $p->codigo,
                    'nombre' => $p->nombre,
                    'tipo_tela' => $p->tipoTela?->nombre,
                    'marca' => $p->marca?->nombre,
                    'unidad' => $p->unidadBase?->abreviatura,
                    'stock' => round((float) ($stock[$p->id] ?? 0), 2),
                    'movimientos' => (int) ($movs[$p->id] ?? 0),
                ])
                ->values()
        );
    }

    /**
     * Los rollos que entraron o salieron en un movimiento del kardex, con su color y su metraje:
     * lo que se abre al tocar un documento: todos los del documento, de cualquier color.
     */
    public function rollos(Request $request, MovimientoInventario $movimiento)
    {
        $tipo = $movimiento->documento_referencia_tipo;
        $documento = $movimiento->documento_referencia_id;

        $filas = collect();
        if ($tipo && $documento) {
            // Lo que dejó huella en el historial de cada rollo con ese documento (sin las reservas ni los
            // pasos de preparación, que no mueven tela).
            $filas = DB::table('rollo_movimientos as rm')
                ->join('rollos as r', 'r.id', '=', 'rm.rollo_id')
                ->where('rm.documento_tipo', $tipo)
                ->where('rm.documento_id', $documento)
                ->whereIn('rm.tipo', ['ingreso', 'despacho', 'venta', 'corte', 'traslado', 'ajuste'])
                ->where('r.producto_id', $movimiento->producto_id)
                // Desde el kardex de un color, solo los rollos de ese color.
                ->when($request->boolean('solo_color') && $movimiento->producto_color_id, fn ($q) => $q->where('r.producto_color_id', $movimiento->producto_color_id))
                ->get(['r.id', 'r.codigo', 'r.producto_color_id', 'r.metros_inicial', 'r.metros_actual', 'r.estado', 'rm.metros as metros_movimiento']);

            // Un ajuste que creó los rollos los deja sin documento en su historial: se ubican por su línea.
            if ($tipo === 'ajuste_inventario') {
                $lineas = DB::table('ajuste_detalles')->where('ajuste_id', $documento)->pluck('id');
                $filas = $filas->concat(
                    DB::table('rollos as r')
                        ->whereIn('r.ajuste_detalle_id', $lineas)
                        ->where('r.producto_id', $movimiento->producto_id)
                        ->when($request->boolean('solo_color') && $movimiento->producto_color_id, fn ($q) => $q->where('r.producto_color_id', $movimiento->producto_color_id))
                        ->get(['r.id', 'r.codigo', 'r.producto_color_id', 'r.metros_inicial', 'r.metros_actual', 'r.estado', 'r.metros_inicial as metros_movimiento'])
                );
            }
        }

        $colores = ProductoColor::whereIn('id', $filas->pluck('producto_color_id')->filter()->unique())
            ->get(['id', 'nombre', 'codigo', 'hex'])
            ->keyBy('id');

        return response()->json(
            $filas->unique('id')->map(function ($r) use ($colores) {
                $color = $colores->get($r->producto_color_id);
                // El metraje del movimiento (una salida lo trae en negativo); si el historial no lo
                // trae, el rollo entero: un traslado mueve el rollo tal como está.
                $metros = abs((float) $r->metros_movimiento);
                if ($metros <= 0) {
                    $metros = (float) ($r->metros_actual > 0 ? $r->metros_actual : $r->metros_inicial);
                }

                return [
                    'id' => $r->id,
                    'codigo' => $r->codigo,
                    'estado' => $r->estado,
                    'metros' => round($metros, 2),
                    'metros_actual' => round((float) $r->metros_actual, 2),
                    'color' => $color ? ['id' => $color->id, 'nombre' => $color->nombre, 'codigo' => $color->codigo, 'hex' => $color->hex] : null,
                ];
            })->sortBy('codigo', SORT_NATURAL)->values()
        );
    }

    public function index(Request $request)
    {
        $movimientos = MovimientoInventario::with([
            // Con su familia, tipo, marca y tejido: el kardex se filtra como el buscador de producto.
            'producto:id,codigo,nombre,unidad_base_id,tipo_tela_id,marca_id,tipo_tejido,categoria_id',
            'producto.categoria:id,nombre',
            'producto.tipoTela:id,nombre,familia_tela_id',
            'producto.tipoTela.familia:id,nombre',
            'producto.marca:id,nombre',
            'producto.unidadBase:id,nombre,abreviatura',
            // Para poder expresar la cantidad en sacos, cajas, kilos…
            'producto.presentaciones:id,producto_id,nombre,factor_conversion,activo',
            'almacen:id,nombre',
            'usuario:id,name',
            // El color, cuando el movimiento nace de rollos concretos.
            'color:id,nombre,codigo,hex',
        ])
            // Los de un solo producto (desde Productos, clic derecho).
            ->when($request->filled('producto_id'), fn ($q) => $q->where('producto_id', $request->integer('producto_id')))
            ->latest('fecha')
            ->latest('id')
            ->limit(1000)
            ->get();

        // Proveedor: solo aplica a movimientos originados por una recepción de compra.
        $recepIds = $movimientos
            ->where('documento_referencia_tipo', 'recepcion_compra')
            ->pluck('documento_referencia_id')
            ->filter()
            ->unique();

        $proveedorPorRecepcion = $recepIds->isEmpty()
            ? collect()
            : RecepcionCompra::with('proveedor:id,nombre')
                ->whereIn('id', $recepIds)
                ->get()
                ->keyBy('id');

        // Lo que cuenta el documento de cada movimiento: su número, con quién se hizo, glosa y referencias.
        $documentos = $this->datosDeDocumentos($movimientos);

        // El stock que quedó de cada color tras cada movimiento.
        $saldoColor = $this->saldoPorColor($movimientos->pluck('id'));

        $movimientos->each(function (MovimientoInventario $mov) use ($proveedorPorRecepcion, $documentos, $saldoColor) {
            $mov->saldo_color = $saldoColor[$mov->id] ?? null;
            $doc = $documentos[$mov->documento_referencia_tipo . ':' . $mov->documento_referencia_id] ?? [];
            $mov->documento_numero = $doc['documento'] ?? null;
            $mov->nombre = $doc['nombre'] ?? null;
            $mov->glosa = $doc['glosa'] ?? null;
            $mov->referencia = $doc['referencia'] ?? null;
            $mov->orden_compra = $doc['orden_compra'] ?? null;
            $mov->doc_registro = $doc['doc_registro'] ?? null;
            $mov->proveedor_nombre = $mov->documento_referencia_tipo === 'recepcion_compra'
                ? optional(optional($proveedorPorRecepcion->get($mov->documento_referencia_id))->proveedor)->nombre
                : null;
        });

        return response()->json($movimientos);
    }

    /** La zona de un rollo dentro del almacén: su ubicación estructurada o, en los rollos viejos, el texto que traían. */
    private function zonaDe(Rollo $r): string
    {
        if ($r->almacen_ubicacion_id && $r->ubicacion) {
            return $r->ubicacion->rutaLegible();
        }

        $texto = array_filter([
            $r->pasillo ? "Pasillo {$r->pasillo}" : null,
            $r->rack ? "Rack {$r->rack}" : null,
            $r->nivel ? "Nivel {$r->nivel}" : null,
            $r->posicion ? "Posición {$r->posicion}" : null,
        ]);

        return $texto ? implode(' · ', $texto) : 'Sin ubicación';
    }

    /**
     * Lo que hay de cada color de una tela: una fila por color con sus rollos y sus metros, lo que está en
     * tránsito, lo reservado (ya en rollos concretos y lo pedido que aún no tiene rollo), lo disponible y en qué
     * zonas del almacén está. Es la tabla que se ve al buscar una tela en el kardex.
     */
    public function colores(Request $request)
    {
        $request->validate(['producto_id' => 'required|integer', 'almacen_id' => 'nullable|integer']);
        $productoId = $request->integer('producto_id');
        $almacenId = $request->integer('almacen_id') ?: null;

        $rollos = AlmacenAcceso::limitar(Rollo::query())
            ->where('producto_id', $productoId)
            ->when($almacenId, fn ($q) => $q->where('almacen_id', $almacenId))
            ->where('metros_actual', '>', 0)
            ->with(['ubicacion', 'almacen:id,nombre'])
            ->get()
            ->groupBy(fn (Rollo $r) => (string) $r->producto_color_id);

        // Los colores que solo aparecen en el historial (ya sin rollos) también se pueden consultar.
        $enMovimientos = DB::table('movimientos_inventario')
            ->where('producto_id', $productoId)
            ->when($almacenId, fn ($q) => $q->where('almacen_id', $almacenId))
            ->distinct()
            ->pluck('producto_color_id')
            ->map(fn ($id) => (string) $id);

        // Lo que los pedidos ya reservaron de un color sin rollo asignado (metros) y los rollos que piden sin asignar.
        $delProducto = fn ($q) => $q->whereHas('presentacion', fn ($p) => $p->where('producto_id', $productoId));
        $pendientes = $delProducto(\App\Models\OrdenVentaDetalle::query())
            ->whereNotNull('cantidad_reservada')->whereNotNull('producto_color_id')
            ->when($almacenId, fn ($q) => $q->where('reserva_almacen_id', $almacenId))
            ->with(['presentacion:id,producto_id', 'rollos'])
            ->get()
            ->groupBy('producto_color_id')
            ->map(fn ($g) => $g->sum(fn ($d) => $d->metrosPendientes()));
        $porAsignar = $delProducto(\App\Models\OrdenVentaDetalle::porAsignar())
            ->whereNotNull('producto_color_id')
            ->when($almacenId, fn ($q) => $q->whereHas('ordenVenta', fn ($o) => $o->where('almacen_id', $almacenId)))
            ->with(['rollos:id,orden_venta_detalle_id'])
            ->get()
            ->groupBy('producto_color_id')
            ->map(fn ($g) => $g->sum(fn ($d) => $d->rollosPendientes()));

        $colores = ProductoColor::whereIn('id', $rollos->keys()->merge($enMovimientos)->filter()->unique()->values())
            ->get(['id', 'nombre', 'codigo', 'hex'])->keyBy('id');

        $enAlmacen = [Rollo::DISPONIBLE, Rollo::SEPARADO, Rollo::EN_PREPARACION, Rollo::EN_REVISION];
        $apartados = [Rollo::SEPARADO, Rollo::EN_PREPARACION];

        $filas = $rollos->keys()->merge($enMovimientos)->unique()->values()->map(function ($clave) use ($rollos, $colores, $pendientes, $porAsignar, $enAlmacen, $apartados) {
            $color = $clave === '' ? null : $colores->get((int) $clave);
            $grupo = $rollos->get($clave, collect());
            $metros = fn ($lista) => round((float) $lista->sum('metros_actual'), 2);

            $fisicos = $grupo->whereIn('estado', $enAlmacen);
            $libres = $grupo->where('estado', Rollo::DISPONIBLE);
            $promedio = $libres->isNotEmpty() ? $metros($libres) / $libres->count() : 0;

            // Lo pedido que aún no tiene rollo: metros ya reservados y rollos por asignar (a metraje promedio).
            $reservadoP = round((float) ($pendientes[$clave] ?? 0) + (int) ($porAsignar[$clave] ?? 0) * $promedio, 2);
            $variosAlmacenes = $fisicos->pluck('almacen_id')->unique()->count() > 1;

            return [
                'id' => $color?->id,
                'codigo' => $color?->codigo,
                'nombre' => $color?->nombre ?? 'Sin color',
                'hex' => $color?->hex,
                'rollos' => $fisicos->count(),
                'fisico' => $metros($fisicos),
                'transito' => $metros($grupo->where('estado', Rollo::EN_TRANSITO)),
                'reservado_f' => $metros($grupo->whereIn('estado', $apartados)),
                'reservado_p' => $reservadoP,
                'disponible' => round(max(0, $metros($libres) - $reservadoP), 2),
                'zonas' => $fisicos
                    ->map(fn (Rollo $r) => ($variosAlmacenes ? ($r->almacen?->nombre.': ') : '').$this->zonaDe($r))
                    ->unique()->sort()->values()->all(),
            ];
        })
            ->sortBy(fn ($f) => ($f['id'] === null ? '~' : '').$f['nombre'])
            ->values();

        return response()->json($filas);
    }

    /** Los rollos de un color (o los sin color) de una tela, con su metraje, estado y zona: la pestaña "Rollos" de un color. */
    public function rollosDeColor(Request $request)
    {
        $request->validate(['producto_id' => 'required|integer', 'producto_color_id' => 'nullable', 'almacen_id' => 'nullable|integer']);
        $color = $request->input('producto_color_id');

        $rollos = AlmacenAcceso::limitar(Rollo::query())
            ->where('producto_id', $request->integer('producto_id'))
            ->when($request->filled('almacen_id'), fn ($q) => $q->where('almacen_id', $request->integer('almacen_id')))
            ->when($color === 'sin' || $color === null || $color === '', fn ($q) => $q->whereNull('producto_color_id'), fn ($q) => $q->where('producto_color_id', (int) $color))
            ->where('metros_actual', '>', 0)
            ->with(['ubicacion', 'almacen:id,nombre'])
            ->orderBy('numero')
            ->get();

        return response()->json($rollos->map(fn (Rollo $r) => [
            'id' => $r->id,
            'codigo' => $r->codigo,
            'estado' => $r->estado,
            'metros_inicial' => round((float) $r->metros_inicial, 2),
            'metros_actual' => round((float) $r->metros_actual, 2),
            'almacen' => $r->almacen?->nombre,
            'zona' => $this->zonaDe($r),
        ])->values());
    }

    /**
     * Saldo corrido por tela + color + almacén, en el orden en que ocurrieron los movimientos: el stock que quedó de ESE
     * color tras cada uno (el saldo_stock guardado mezcla todos los colores de la tela).
     *
     * @return array<int, float> id del movimiento => saldo de su color tras él
     */
    private function saldoPorColor($ids): array
    {
        if ($ids->isEmpty()) {
            return [];
        }

        $pedidos = array_flip($ids->all());

        return DB::table('movimientos_inventario as m')
            ->selectRaw('m.id, SUM(m.cantidad) OVER (PARTITION BY m.producto_id, m.producto_color_id, m.almacen_id ORDER BY m.fecha, m.id) as saldo')
            ->get()
            ->filter(fn ($f) => isset($pedidos[$f->id]))
            ->mapWithKeys(fn ($f) => [(int) $f->id => (float) $f->saldo])
            ->all();
    }

    /**
     * El documento que originó cada movimiento, para leer el kardex como un libro: número del
     * documento, con quién se hizo (proveedor, cliente, almacenes), glosa y sus referencias.
     *
     * @return array<string, array<string, ?string>> "tipo:id" => datos
     */
    private function datosDeDocumentos($movimientos): array
    {
        $ids = fn (string $tipo) => $movimientos->where('documento_referencia_tipo', $tipo)
            ->pluck('documento_referencia_id')->filter()->unique()->values();
        $serieNumero = fn ($serie, $numero) => $serie && $numero ? "{$serie}-{$numero}" : null;
        $salida = [];

        if (($recepciones = $ids('recepcion_compra'))->isNotEmpty()) {
            DB::table('recepciones_compra as r')
                ->leftJoin('proveedores as p', 'p.id', '=', 'r.proveedor_id')
                ->leftJoin('compras as c', 'c.id', '=', 'r.compra_id')
                ->leftJoin('ordenes_compra as oc', 'oc.id', '=', DB::raw('COALESCE(r.orden_compra_id, c.orden_compra_id)'))
                ->whereIn('r.id', $recepciones)
                ->get(['r.id', 'r.serie', 'r.numero', 'r.observaciones', 'p.nombre as proveedor', 'c.correlativo', 'c.serie as c_serie', 'c.numero as c_numero', 'c.guia', 'oc.codigo as oc_codigo'])
                ->each(function ($r) use (&$salida, $serieNumero) {
                    $salida["recepcion_compra:{$r->id}"] = [
                        'documento' => $serieNumero($r->serie, $r->numero) ?? "Recepción {$r->id}",
                        'nombre' => $r->proveedor,
                        'glosa' => $r->observaciones ?: 'Recepción de compra',
                        // Lo que trajo el proveedor (su factura o su guía).
                        'referencia' => $serieNumero($r->c_serie, $r->c_numero) ?? $r->guia,
                        'orden_compra' => $r->oc_codigo,
                        // El número con el que quedó registrada la compra aquí.
                        'doc_registro' => $r->correlativo ? sprintf('C001-%03d', $r->correlativo) : null,
                    ];
                });
        }

        if (($notas = $ids('nota_venta'))->isNotEmpty()) {
            DB::table('notas_venta as n')
                ->leftJoin('clientes as c', 'c.id', '=', 'n.cliente_id')
                ->leftJoin('ordenes_venta as o', 'o.id', '=', 'n.orden_venta_id')
                ->whereIn('n.id', $notas)
                ->get(['n.id', 'n.serie', 'n.numero', 'n.observaciones', 'c.nombre as cliente', 'o.serie as o_serie', 'o.numero as o_numero'])
                ->each(function ($n) use (&$salida, $serieNumero) {
                    $salida["nota_venta:{$n->id}"] = [
                        'documento' => $serieNumero($n->serie, $n->numero) ?? "Venta {$n->id}",
                        'nombre' => $n->cliente,
                        'glosa' => $n->observaciones ?: 'Venta',
                        'referencia' => $serieNumero($n->o_serie, $n->o_numero),
                    ];
                });
        }

        if (($pedidos = $ids('orden_venta'))->isNotEmpty()) {
            DB::table('ordenes_venta as o')
                ->leftJoin('clientes as c', 'c.id', '=', 'o.cliente_id')
                ->whereIn('o.id', $pedidos)
                ->get(['o.id', 'o.serie', 'o.numero', 'o.observaciones', 'o.requerimiento_numero', 'c.nombre as cliente'])
                ->each(function ($o) use (&$salida, $serieNumero) {
                    $salida["orden_venta:{$o->id}"] = [
                        'documento' => $serieNumero($o->serie, $o->numero) ?? "Pedido {$o->id}",
                        'nombre' => $o->cliente,
                        'glosa' => $o->observaciones ?: 'Despacho de pedido',
                        'referencia' => $o->requerimiento_numero,
                    ];
                });
        }

        if (($guias = $ids('transferencia'))->isNotEmpty()) {
            DB::table('transferencias as t')
                ->leftJoin('almacenes as ao', 'ao.id', '=', 't.almacen_origen_id')
                ->leftJoin('almacenes as ad', 'ad.id', '=', 't.almacen_destino_id')
                ->whereIn('t.id', $guias)
                ->get(['t.id', 't.serie', 't.numero', 't.requerimiento_serie', 't.requerimiento_numero', 't.motivo_traslado', 'ao.nombre as origen', 'ad.nombre as destino'])
                ->each(function ($t) use (&$salida, $serieNumero) {
                    $salida["transferencia:{$t->id}"] = [
                        'documento' => $serieNumero($t->serie, $t->numero) ?? "Traslado {$t->id}",
                        'nombre' => ($t->origen ?? '—') . ' → ' . ($t->destino ?? '—'),
                        'glosa' => $t->motivo_traslado ? ucfirst(str_replace('_', ' ', $t->motivo_traslado)) : 'Traslado entre almacenes',
                        'referencia' => $serieNumero($t->requerimiento_serie, $t->requerimiento_numero),
                    ];
                });
        }

        if (($ajustes = $ids('ajuste_inventario'))->isNotEmpty()) {
            DB::table('ajustes_inventario as a')
                ->leftJoin('proveedores as p', 'p.id', '=', 'a.proveedor_id')
                ->whereIn('a.id', $ajustes)
                ->get(['a.id', 'a.serie', 'a.numero', 'a.motivo', 'a.observaciones', 'p.nombre as proveedor'])
                ->each(function ($a) use (&$salida, $serieNumero) {
                    $salida["ajuste_inventario:{$a->id}"] = [
                        'documento' => $serieNumero($a->serie, $a->numero) ?? "Ajuste {$a->id}",
                        'nombre' => $a->proveedor,
                        'glosa' => trim(($a->motivo ?? '') . ($a->observaciones ? ' — ' . $a->observaciones : '')) ?: 'Ajuste de inventario',
                    ];
                });
        }

        if (($prestamos = $ids('prestamo'))->isNotEmpty()) {
            DB::table('prestamos')
                ->whereIn('id', $prestamos)
                ->get(['id', 'serie', 'numero', 'tipo', 'tercero', 'observaciones'])
                ->each(function ($p) use (&$salida, $serieNumero) {
                    $salida["prestamo:{$p->id}"] = [
                        'documento' => $serieNumero($p->serie, $p->numero) ?? "Préstamo {$p->id}",
                        'nombre' => $p->tercero,
                        'glosa' => $p->observaciones ?: 'Préstamo ' . ($p->tipo === 'prestado' ? 'entregado' : 'recibido'),
                    ];
                });
        }

        if (($tomas = $ids('toma_inventario'))->isNotEmpty()) {
            DB::table('tomas_inventario')
                ->whereIn('id', $tomas)
                ->get(['id', 'observaciones'])
                ->each(function ($t) use (&$salida) {
                    $salida["toma_inventario:{$t->id}"] = [
                        'documento' => "Toma {$t->id}",
                        'glosa' => $t->observaciones ?: 'Toma de inventario',
                    ];
                });
        }

        return $salida;
    }
}
