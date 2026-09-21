<?php

namespace App\Services;

use App\Models\Almacen;
use App\Models\Importacion;
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
     * rollo fallaría por falta de stock aunque la tela esté en el almacén. Se
     * puede desactivar con `$actualizarStock` cuando quien llama ya registró
     * la entrada —es el caso de la recepción de compra—.
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
        bool $actualizarStock = true,
        ?Importacion $importacion = null,
        array $ubicacion = [],
    ): Collection {
        // Solo las cuatro claves de sitio, para que nadie cuele otra cosa en
        // el create() por pasar el array entero de un formulario.
        $ubicacion = array_intersect_key(
            $ubicacion,
            array_flip(['pasillo', 'rack', 'nivel', 'posicion', 'almacen_ubicacion_id']),
        );

        return DB::transaction(function () use ($producto, $color, $almacen, $lineas, $costoUnitario, $recepcion, $codigoProveedor, $usuarioId, $actualizarStock, $importacion, $ubicacion) {
            // `numero` es el correlativo del rollo dentro de su tela y color
            // (único por color, y no se reinicia: el 19 de un segundo
            // contenedor no choca con el 19 del primero).
            $numero = $this->siguienteNumero($producto, $color);
            $prefijo = $this->prefijo($producto, $color, $codigoProveedor);
            // El correlativo del CÓDIGO, en cambio, con código de orden es de
            // la orden entera: sigue corriendo al cambiar de tela, color o
            // envío, y nunca se repite.
            $correlativo = $codigoProveedor ? $this->siguienteNumeroDeOrden($prefijo) : $numero;

            $creados = collect();

            foreach ($lineas as $linea) {
                $metros = round((float) ($linea['metros'] ?? 0), 2);

                if ($metros <= 0) {
                    continue;
                }

                // El packing list del proveedor a veces ya trae el código
                // único de cada rollo (columna "código único"): se respeta
                // tal cual en vez de generar uno, porque es el que la
                // fábrica imprimió en su propia etiqueta. Sin ese dato, se
                // arma como siempre.
                $codigo = trim((string) ($linea['codigo'] ?? ''));
                if ($codigo !== '' && Rollo::where('codigo', $codigo)->exists()) {
                    throw new \RuntimeException("Ya existe un rollo con el código \"{$codigo}\".");
                }
                // Con código de orden/proveedor el correlativo lleva seis
                // dígitos (KET-003-26-000001), como lo numera la fábrica; el
                // esquema por producto y color conserva sus cuatro.
                $codigo = $codigo !== '' ? $codigo : sprintf($codigoProveedor ? '%s-%06d' : '%s-%04d', $prefijo, $correlativo);

                $rollo = Rollo::create([
                    'producto_id' => $producto->id,
                    'producto_color_id' => $color?->id,
                    'almacen_id' => $almacen->id,
                    'codigo' => $codigo,
                    'codigo_proveedor' => $codigoProveedor,
                    'numero' => $numero,
                    'metros_inicial' => $metros,
                    'metros_actual' => $metros,
                    'peso_kg' => $linea['peso_kg'] ?? null,
                    'costo_unitario' => $costoUnitario,
                    'estado' => Rollo::DISPONIBLE,
                    'recepcion_compra_id' => $recepcion?->id,
                    // Quién lo escaneó al llegar (si la recepción fue con escaneo).
                    'usuario_recibe_id' => $linea['usuario_recibe_id'] ?? null,
                    'importacion_id' => $importacion?->id,
                ] + $ubicacion);

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
                $numero++;
                $correlativo++;
            }

            // La recepción de compra ya registró la entrada de stock por su
            // cuenta; sumar aquí otra vez contaría la mercadería dos veces.
            if ($actualizarStock && $creados->isNotEmpty()) {
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
     * Devuelve metros a un rollo: lo contrario de cortar. Pasa al anular o
     * corregir una venta que ya había cortado tela de él.
     *
     * Si el rollo había quedado agotado o vendido, vuelve a estar disponible
     * y sin dueño: la tela regresó al almacén.
     */
    public function devolver(
        Rollo $rollo,
        float $metros,
        string $tipoMovimiento = RolloMovimiento::CANCELACION,
        ?string $documentoTipo = null,
        ?int $documentoId = null,
        ?int $usuarioId = null,
    ): Rollo {
        return DB::transaction(function () use ($rollo, $metros, $tipoMovimiento, $documentoTipo, $documentoId, $usuarioId) {
            $rollo = Rollo::lockForUpdate()->findOrFail($rollo->id);

            $metros = round($metros, 2);
            if ($metros <= 0) {
                return $rollo;
            }

            $antes = (float) $rollo->metros_actual;
            $despues = round($antes + $metros, 2);
            $estadoAntes = $rollo->estado;
            $estadoDespues = in_array($estadoAntes, [Rollo::AGOTADO, Rollo::VENDIDO], true)
                ? Rollo::DISPONIBLE
                : $estadoAntes;

            $rollo->update([
                'metros_actual' => $despues,
                'estado' => $estadoDespues,
                'cliente_id' => $estadoDespues === Rollo::DISPONIBLE ? null : $rollo->cliente_id,
            ]);

            $this->registrar(
                $rollo,
                $tipoMovimiento,
                $metros,
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
     * Parte un rollo en dos: separa $metros en un rollo nuevo, en el almacén
     * que se indique, y deja el resto en el original con su mismo código.
     *
     * Pasa al enviar una guía de traslado cuando lo que se manda no coincide
     * con rollos completos: una parte del rollo viaja, la otra se queda.
     */
    public function dividir(Rollo $rollo, float $metros, int $almacenDestinoId, ?int $usuarioId = null): Rollo
    {
        return DB::transaction(function () use ($rollo, $metros, $almacenDestinoId, $usuarioId) {
            $rollo = Rollo::lockForUpdate()->findOrFail($rollo->id);

            $metros = round($metros, 2);
            $antes = (float) $rollo->metros_actual;

            if ($metros <= 0 || $metros >= $antes) {
                throw new \DomainException(
                    "El rollo {$rollo->codigo} tiene {$antes} m: no se puede partir en {$metros} m."
                );
            }

            $codigo = $this->codigoDeParte($rollo->codigo);
            // "numero" es único por tela y color: la parte nueva es, a todo
            // efecto, un rollo más en esa numeración, aunque su código deje
            // claro de cuál viene.
            $numero = $this->siguienteNumero(
                Producto::find($rollo->producto_id),
                $rollo->producto_color_id ? ProductoColor::find($rollo->producto_color_id) : null,
            );

            $nuevo = Rollo::create([
                'producto_id' => $rollo->producto_id,
                'producto_color_id' => $rollo->producto_color_id,
                'almacen_id' => $almacenDestinoId,
                'codigo' => $codigo,
                'codigo_proveedor' => $rollo->codigo_proveedor,
                'numero' => $numero,
                'metros_inicial' => $metros,
                'metros_actual' => $metros,
                'peso_kg' => null,
                'costo_unitario' => $rollo->costo_unitario,
                'estado' => Rollo::DISPONIBLE,
                'recepcion_compra_id' => $rollo->recepcion_compra_id,
                'importacion_id' => $rollo->importacion_id,
            ]);

            $this->registrar(
                $nuevo, RolloMovimiento::TRASLADO, $metros, 0, $metros,
                null, Rollo::DISPONIBLE, null, null, $usuarioId,
                "Parte de {$rollo->codigo}",
            );

            $despues = round($antes - $metros, 2);
            $estadoAntes = $rollo->estado;
            $rollo->update(['metros_actual' => $despues]);

            $this->registrar(
                $rollo, RolloMovimiento::TRASLADO, -$metros, $antes, $despues,
                $estadoAntes, $rollo->estado, null, null, $usuarioId,
                "Se separó {$codigo} con {$metros} m",
            );

            return $nuevo;
        });
    }

    /** "KET-003-26-000001-B", o "-C", "-D"… si ya existe una parte anterior. */
    private function codigoDeParte(string $codigoOriginal): string
    {
        foreach (range('B', 'Z') as $letra) {
            $codigo = "{$codigoOriginal}-{$letra}";
            if (! Rollo::where('codigo', $codigo)->exists()) {
                return $codigo;
            }
        }

        throw new \DomainException("El rollo {$codigoOriginal} ya tiene demasiadas partes separadas.");
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
     * Siguiente correlativo entre todos los rollos de una orden (KET-003-26),
     * cuenten los que se numeraron aquí o los que trajo ya numerados el
     * packing list del proveedor.
     */
    private function siguienteNumeroDeOrden(string $prefijo): int
    {
        $ultimo = Rollo::where('codigo', 'like', $prefijo.'-%')
            ->pluck('codigo')
            ->map(fn ($codigo) => preg_match('/-(\d+)$/', $codigo, $m) ? (int) $m[1] : 0)
            ->max();

        return (int) $ultimo + 1;
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
