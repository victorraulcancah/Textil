<?php

namespace App\Services;

use App\Models\Almacen;
use App\Models\Producto;
use App\Models\ProductoColor;
use App\Models\RecepcionCompra;
use App\Models\Rollo;
use App\Models\RolloMovimiento;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Todo lo que le puede pasar a un rollo, con su historial.
 *
 * Ningún sitio debe tocar `estado` ni `metros_actual` a mano: siempre por
 * aquí, para que quede el rastro que pide el cliente (quién, cuándo, con qué
 * documento y de qué estado a qué estado).
 */
class RolloService
{
    public function __construct(
        protected StockService $stock,
    ) {}

    /**
     * Crea los rollos de un color a partir de la lista de metrajes que trae
     * el packing list del proveedor.
     *
     * Es el ingreso masivo: se pega "55, 58, 96, 78, 85…" y salen 18 rollos
     * numerados y codificados, listos para imprimir sus etiquetas.
     *
     * Además suma los metros al stock del producto: los rollos son el detalle
     * de esa existencia, no un inventario paralelo. Si no se sumara, vender un
     * rollo fallaría por falta de stock aunque la tela esté en el almacén.
     *
     * @param  list<array{metros: float, peso_kg?: float|null}>  $lineas
     * @return Collection<int, Rollo>
     */
    public function ingresar(
        Producto $producto,
        ?ProductoColor $color,
        Almacen $almacen,
        array $lineas,
        float $costoUnitario = 0,
        ?RecepcionCompra $recepcion = null,
        ?string $codigoProveedor = null,
        ?int $usuarioId = null,
    ): Collection {
        return DB::transaction(function () use ($producto, $color, $almacen, $lineas, $costoUnitario, $recepcion, $codigoProveedor, $usuarioId) {
            // Se continúa la numeración del color, no se reinicia: el rollo 19
            // de un segundo contenedor no puede chocar con el 19 del primero.
            $siguiente = $this->siguienteNumero($producto, $color);
            $prefijo = $this->prefijo($producto, $color, $codigoProveedor);

            $creados = collect();

            foreach ($lineas as $linea) {
                $metros = round((float) ($linea['metros'] ?? 0), 2);

                if ($metros <= 0) {
                    continue;
                }

                $rollo = Rollo::create([
                    'producto_id' => $producto->id,
                    'producto_color_id' => $color?->id,
                    'almacen_id' => $almacen->id,
                    'codigo' => sprintf('%s-%04d', $prefijo, $siguiente),
                    'codigo_proveedor' => $codigoProveedor,
                    'numero' => $siguiente,
                    'metros_inicial' => $metros,
                    'metros_actual' => $metros,
                    'peso_kg' => $linea['peso_kg'] ?? null,
                    'costo_unitario' => $costoUnitario,
                    'estado' => Rollo::DISPONIBLE,
                    'recepcion_compra_id' => $recepcion?->id,
                ]);

                $this->registrar(
                    $rollo,
                    RolloMovimiento::INGRESO,
                    $metros,
                    0,
                    $metros,
                    null,
                    Rollo::DISPONIBLE,
                    $recepcion ? 'recepcion_compra' : null,
                    $recepcion?->id,
                    $usuarioId,
                );

                $creados->push($rollo);
                $siguiente++;
            }

            if ($creados->isNotEmpty()) {
                $this->sumarAlStock($producto, $almacen, (float) $creados->sum('metros_inicial'), $costoUnitario, $recepcion);
            }

            return $creados;
        });
    }

    /**
     * Lleva los metros ingresados a las existencias del producto.
     *
     * El stock vive por presentación, así que se usa la que se vende por
     * metro. Un producto sin ella no se maneja por metros y se deja pasar sin
     * tocar existencias: los rollos siguen quedando registrados.
     */
    private function sumarAlStock(
        Producto $producto,
        Almacen $almacen,
        float $metros,
        float $costoPorMetro,
        ?RecepcionCompra $recepcion,
    ): void {
        $presentacion = $producto->presentaciones()
            ->with('unidadBase')
            ->get()
            ->first(fn ($p) => strtolower($p->unidadBase?->abreviatura ?? '') === 'm');

        if (! $presentacion) {
            return;
        }

        $factor = (float) ($presentacion->factor_conversion ?: 1);
        $cantidad = round($metros * $producto->factorBasePorMetro() / $factor, 2);

        if ($cantidad <= 0) {
            return;
        }

        $this->stock->entrada(
            $presentacion,
            $almacen,
            $cantidad,
            $costoPorMetro * $factor / max($producto->factorBasePorMetro(), 1),
            'ingreso_rollos',
            $recepcion ? 'recepcion_compra' : 'rollos',
            $recepcion?->id,
        );
    }

    /**
     * Mueve el rollo de estado dejando constancia. No toca los metros.
     */
    public function cambiarEstado(
        Rollo $rollo,
        string $estado,
        string $tipoMovimiento,
        ?string $documentoTipo = null,
        ?int $documentoId = null,
        ?int $usuarioId = null,
        ?string $observacion = null,
    ): Rollo {
        return DB::transaction(function () use ($rollo, $estado, $tipoMovimiento, $documentoTipo, $documentoId, $usuarioId, $observacion) {
            $antes = $rollo->estado;

            if ($antes === $estado) {
                return $rollo;
            }

            $rollo->update(['estado' => $estado]);

            $this->registrar(
                $rollo,
                $tipoMovimiento,
                0,
                (float) $rollo->metros_actual,
                (float) $rollo->metros_actual,
                $antes,
                $estado,
                $documentoTipo,
                $documentoId,
                $usuarioId,
                $observacion,
            );

            return $rollo->refresh();
        });
    }

    /**
     * Corta metros del rollo. El rollo sigue existiendo con el mismo código y
     * menos metros; si llega a cero queda agotado.
     */
    public function cortar(
        Rollo $rollo,
        float $metros,
        string $tipoMovimiento = RolloMovimiento::VENTA,
        ?string $documentoTipo = null,
        ?int $documentoId = null,
        ?int $usuarioId = null,
    ): Rollo {
        return DB::transaction(function () use ($rollo, $metros, $tipoMovimiento, $documentoTipo, $documentoId, $usuarioId) {
            $rollo = Rollo::lockForUpdate()->findOrFail($rollo->id);

            $metros = round($metros, 2);
            $antes = (float) $rollo->metros_actual;

            if ($metros <= 0 || $metros > $antes) {
                throw new \DomainException(
                    "El rollo {$rollo->codigo} tiene {$antes} m: no se pueden sacar {$metros} m."
                );
            }

            $despues = round($antes - $metros, 2);
            $estadoAntes = $rollo->estado;

            // Un rollo en cero ya no vuelve: queda agotado como constancia de
            // que existió y de a dónde se fue.
            $estadoDespues = $despues <= 0 ? Rollo::AGOTADO : $rollo->estado;

            $rollo->update([
                'metros_actual' => $despues,
                'estado' => $estadoDespues,
            ]);

            $this->registrar(
                $rollo,
                $tipoMovimiento,
                -$metros,
                $antes,
                $despues,
                $estadoAntes,
                $estadoDespues,
                $documentoTipo,
                $documentoId,
                $usuarioId,
            );

            return $rollo->refresh();
        });
    }

    /**
     * Cambia la ubicación física del rollo, y de almacén si hace falta.
     *
     * @param  array{almacen_id?: int, pasillo?: ?string, rack?: ?string, nivel?: ?string, posicion?: ?string}  $destino
     */
    public function trasladar(Rollo $rollo, array $destino, ?int $usuarioId = null): Rollo
    {
        return DB::transaction(function () use ($rollo, $destino, $usuarioId) {
            $desde = $rollo->load('almacen')->ubicacionLegible();

            $rollo->update(array_intersect_key($destino, array_flip([
                'almacen_id', 'pasillo', 'rack', 'nivel', 'posicion',
            ])));

            $rollo->refresh()->load('almacen');

            $this->registrar(
                $rollo,
                RolloMovimiento::TRASLADO,
                0,
                (float) $rollo->metros_actual,
                (float) $rollo->metros_actual,
                $rollo->estado,
                $rollo->estado,
                null,
                null,
                $usuarioId,
                "De {$desde} a {$rollo->ubicacionLegible()}",
            );

            return $rollo;
        });
    }

    /**
     * Siguiente correlativo del rollo dentro de su tela y color.
     */
    public function siguienteNumero(Producto $producto, ?ProductoColor $color): int
    {
        return (int) Rollo::where('producto_id', $producto->id)
            ->where('producto_color_id', $color?->id)
            ->max('numero') + 1;
    }

    /**
     * Prefijo del código de rollo. Se prefiere el código del proveedor tal
     * como viene (A103-21), porque es el que permite cruzar con su packing
     * list; si no hay, se arma con el del producto y el del color.
     */
    private function prefijo(Producto $producto, ?ProductoColor $color, ?string $codigoProveedor): string
    {
        if ($codigoProveedor) {
            return $codigoProveedor;
        }

        return implode('-', array_filter([
            $producto->codigo ?: 'ROLLO',
            $color?->codigo ?: $color?->id,
        ]));
    }

    /** Escribe una línea del historial del rollo. */
    private function registrar(
        Rollo $rollo,
        string $tipo,
        float $metros,
        float $metrosAntes,
        float $metrosDespues,
        ?string $estadoAntes,
        ?string $estadoDespues,
        ?string $documentoTipo = null,
        ?int $documentoId = null,
        ?int $usuarioId = null,
        ?string $observacion = null,
    ): void {
        RolloMovimiento::create([
            'rollo_id' => $rollo->id,
            'tipo' => $tipo,
            'metros' => $metros,
            'metros_antes' => $metrosAntes,
            'metros_despues' => $metrosDespues,
            'estado_antes' => $estadoAntes,
            'estado_despues' => $estadoDespues,
            'documento_tipo' => $documentoTipo,
            'documento_id' => $documentoId,
            'user_id' => $usuarioId ?? auth()->id(),
            'observacion' => $observacion,
        ]);
    }
}
