import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Package, PackageSearch, Plus, RotateCcw, Search, Warehouse, X } from 'lucide-react';
import api, { asList } from '../lib/api';
import { Button, Modal, SearchSelect, Select, Spinner } from './ui';

/** Minúsculas y sin tildes, para que "nunez" encuentre "Nuñez". */
const normalize = (texto) =>
    String(texto ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const numero = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/** "punto" → "Punto": los valores de tipo de tejido se escriben a mano. */
const capitalizar = (texto) => {
    const t = String(texto ?? '').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
};

const filtrosVacios = {
    texto: '',
    tipoTejido: '',
    color: '',
    categoria: '',
    subCategoria: '',
    marca: '',
    subMarca: '',
    stockEstado: '',
    stockHasta: '',
};

const ESTADO_STOCK_OPTIONS = [
    { value: 'sin', label: 'Sin stock (0)' },
    { value: 'con', label: 'Con stock' },
    { value: 'bajo', label: 'Bajo el mínimo' },
    { value: 'sobre', label: 'Sobre el máximo' },
];

/** Opciones únicas para un filtro, a partir de una relación de los productos. */
const opcionesDe = (productos, clave) => {
    const mapa = new Map();
    productos.forEach((p) => {
        const rel = p[clave];
        if (rel?.id != null) mapa.set(String(rel.id), rel.nombre);
    });
    return [...mapa.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es'));
};

/**
 * Cuántas unidades base son un metro. El stock va en unidad base (centímetros
 * en la tela); se muestra en metros si el producto tiene formato por metro.
 * null si el producto no se mide en metros (un cono, un cierre).
 */
const basePorMetro = (producto) => {
    const porMetro = (producto?.presentaciones ?? []).find(
        (p) => normalize(p.unidad_base?.abreviatura) === 'm',
    );
    const factor = Number(porMetro?.factor_conversion);
    return factor > 0 ? factor : null;
};

/**
 * Buscador de productos en modal, con filtros por tipo de tela, color,
 * categoría y marca. Compartido entre compras, ventas y pedidos.
 *
 *   multiple = false → onSelect(producto, presentacion, cantidad)
 *   multiple = true  → onSelect([{ producto, presentacion, cantidad }, …]) al pulsar "Agregar"
 *
 * productos / stockPorProducto son opcionales; si no se pasan, el modal los carga solo.
 *
 * Con `existencias` muestra el stock de cada almacén y por color. Nunca
 * muestra códigos de rollo: quien vende ve cuánta tela hay y dónde, pero los
 * rollos concretos los elige el almacén.
 */
export default function ProductoPickerModal({
    open,
    onClose,
    onSelect,
    initialQuery = '',
    multiple = false,
    /** Muestra los filtros de stock mín./máx. (útil en compras, no en ventas). */
    stockFilter = false,
    productos: productosProp,
    stockPorProducto = {},
    /**
     * Impide marcar lo que está en cero. En una venta sí (sale del almacén al
     * momento); en un pedido no, porque se prepara después y el vendedor puede
     * comprometer tela que aún no ha llegado.
     */
    bloquearSinStock = true,
    /** Filas de /existencias: producto × almacén, con metros por color. */
    existencias = null,
    /** Almacén de la venta, para resaltarlo entre los demás. */
    almacenId = null,
    title = 'Buscar producto',
}) {
    const [filtros, setFiltros] = useState(filtrosVacios);
    /** Unidad elegida por fila: { [productoId]: presentacionId } */
    const [unidades, setUnidades] = useState({});
    /** Marcados en modo múltiple: { [productoId]: true } */
    const [marcados, setMarcados] = useState({});
    /** Cantidad escrita por fila: { [productoId]: '3' } */
    const [cantidades, setCantidades] = useState({});
    const [productosPropios, setProductosPropios] = useState(null);
    const [cargando, setCargando] = useState(false);
    const inputRef = useRef(null);

    const productos = productosProp ?? productosPropios ?? [];
    const debeCargar = !productosProp && productosPropios === null;
    const conDesglose = Array.isArray(existencias);

    // Carga propia solo si el padre no entregó el catálogo.
    useEffect(() => {
        if (!open || !debeCargar) return;
        let vivo = true;
        setCargando(true);
        api.get('/productos', { params: { per_page: 500 } })
            .then((res) => vivo && setProductosPropios(asList(res)))
            .catch(() => vivo && setProductosPropios([]))
            .finally(() => vivo && setCargando(false));
        return () => {
            vivo = false;
        };
    }, [open, debeCargar]);

    // Cada apertura arranca con el texto que traiga el padre y el foco en el buscador.
    useEffect(() => {
        if (!open) return;
        setFiltros({ ...filtrosVacios, texto: initialQuery });
        setUnidades({});
        setMarcados({});
        setCantidades({});
        const t = setTimeout(() => inputRef.current?.focus(), 50);
        return () => clearTimeout(t);
    }, [open, initialQuery]);

    const setFiltro = (patch) => setFiltros((prev) => ({ ...prev, ...patch }));

    const categoriaOptions = useMemo(() => opcionesDe(productos, 'categoria'), [productos]);
    const marcaOptions = useMemo(() => opcionesDe(productos, 'marca'), [productos]);

    // Sub-categoría y sub-marca se acotan a lo elegido en su filtro padre.
    const subCategoriaOptions = useMemo(
        () =>
            opcionesDe(
                filtros.categoria
                    ? productos.filter((p) => String(p.categoria?.id) === filtros.categoria)
                    : productos,
                'sub_categoria',
            ),
        [productos, filtros.categoria],
    );

    const subMarcaOptions = useMemo(
        () =>
            opcionesDe(
                filtros.marca ? productos.filter((p) => String(p.marca?.id) === filtros.marca) : productos,
                'sub_marca',
            ),
        [productos, filtros.marca],
    );

    /** Tipos de tejido escritos en la ficha técnica (plano, punto…). */
    const tipoTejidoOptions = useMemo(() => {
        const mapa = new Map();
        productos.forEach((p) => {
            const clave = normalize(p.tipo_tejido);
            if (clave && !mapa.has(clave)) mapa.set(clave, capitalizar(p.tipo_tejido));
        });
        return [...mapa.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    }, [productos]);

    /**
     * Colores por nombre. Cada tela tiene sus propios colores, así que "Negro"
     * de una y "Negro" de otra son registros distintos: se agrupan por nombre
     * para poder buscar "todo lo que haya en negro".
     */
    const colorOptions = useMemo(() => {
        const mapa = new Map();
        productos.forEach((p) =>
            (p.colores ?? []).forEach((c) => {
                const clave = normalize(c.nombre);
                if (clave && !mapa.has(clave)) mapa.set(clave, c.nombre);
            }),
        );
        return [...mapa.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    }, [productos]);

    /** Stock de cada producto en cada almacén: { [productoId]: [fila, …] }. */
    const stockPorAlmacen = useMemo(() => {
        const mapa = {};
        (existencias ?? []).forEach((fila) => {
            const pid = String(fila.producto_id ?? fila.producto?.id ?? '');
            if (!pid) return;
            (mapa[pid] ??= []).push({
                almacenId: String(fila.almacen_id ?? fila.almacen?.id ?? ''),
                almacen: fila.almacen?.nombre ?? '—',
                base: Number(fila.stock_actual) || 0,
                colores: fila.colores ?? [],
            });
        });
        return mapa;
    }, [existencias]);

    const presentacionesDe = useCallback(
        (producto) => (producto?.presentaciones ?? []).filter((pres) => pres.activo !== false),
        [],
    );

    /** Unidad activa de una fila (la elegida o la primera disponible). */
    const unidadDe = useCallback(
        (producto) => {
            const presentaciones = presentacionesDe(producto);
            const id = unidades[String(producto.id)] ?? String(presentaciones[0]?.id ?? '');
            return presentaciones.find((pres) => String(pres.id) === String(id)) ?? null;
        },
        [presentacionesDe, unidades],
    );

    const resultados = useMemo(() => {
        const q = normalize(filtros.texto);

        return productos.filter((p) => {
            if (filtros.tipoTejido && normalize(p.tipo_tejido) !== filtros.tipoTejido) return false;
            if (filtros.color && !(p.colores ?? []).some((c) => normalize(c.nombre) === filtros.color)) {
                return false;
            }
            if (filtros.categoria && String(p.categoria?.id) !== filtros.categoria) return false;
            if (filtros.subCategoria && String(p.sub_categoria?.id) !== filtros.subCategoria) return false;
            if (filtros.marca && String(p.marca?.id) !== filtros.marca) return false;
            if (filtros.subMarca && String(p.sub_marca?.id) !== filtros.subMarca) return false;

            if (stockFilter && (filtros.stockEstado || filtros.stockHasta !== '')) {
                const stock = Number(stockPorProducto[String(p.id)] ?? 0);
                const minimo = Number(p.stock_minimo) || 0;
                const maximo = Number(p.stock_maximo) || 0;

                // "Bajo/sobre" solo aplican si el producto tiene ese umbral definido.
                if (filtros.stockEstado === 'sin' && stock > 0) return false;
                if (filtros.stockEstado === 'con' && stock <= 0) return false;
                if (filtros.stockEstado === 'bajo' && !(minimo > 0 && stock < minimo)) return false;
                if (filtros.stockEstado === 'sobre' && !(maximo > 0 && stock > maximo)) return false;

                // "Stock hasta 10" = de 10 hacia abajo, incluyendo 0.
                if (filtros.stockHasta !== '' && stock > Number(filtros.stockHasta)) return false;
            }

            if (!q) return true;

            const heno = normalize(
                [
                    p.nombre,
                    p.codigo,
                    p.codigo_barras,
                    p.descripcion,
                    p.tipo_tejido,
                    p.marca?.nombre,
                    p.sub_marca?.nombre,
                    p.categoria?.nombre,
                    p.sub_categoria?.nombre,
                    // Escribir "azul" también encuentra las telas que vienen en azul.
                    ...(p.colores ?? []).map((c) => c.nombre),
                ]
                    .filter(Boolean)
                    .join(' '),
            );
            return heno.includes(q);
        });
    }, [productos, filtros, stockFilter, stockPorProducto]);

    const filtrosActivos = Object.values(filtros).filter(Boolean).length;

    /**
     * Seleccionados en modo múltiple. Se resuelven contra `productos` (no contra
     * `resultados`) para que no se pierdan al cambiar los filtros.
     */
    const seleccionados = useMemo(
        () =>
            Object.keys(marcados)
                .filter((id) => marcados[id])
                .map((id) => productos.find((p) => String(p.id) === id))
                .filter(Boolean)
                .map((producto) => ({
                    producto,
                    presentacion: unidadDe(producto),
                    cantidad: Number(cantidades[String(producto.id)] ?? 1) || 1,
                })),
        [marcados, productos, unidadDe, cantidades],
    );

    const alternar = (producto) => {
        if (presentacionesDe(producto).length === 0) return;
        // Sin existencias en el almacén no se puede marcar, aunque se liste.
        const disponible = stockPorProducto[String(producto.id)];
        if (bloquearSinStock && disponible != null && Number(disponible) <= 0) return;
        setMarcados((prev) => {
            const id = String(producto.id);
            const next = { ...prev };
            if (next[id]) delete next[id];
            else next[id] = true;
            return next;
        });
    };

    const desmarcar = (productoId) =>
        setMarcados((prev) => {
            const next = { ...prev };
            delete next[String(productoId)];
            return next;
        });

    const confirmarMultiple = () => {
        const utiles = seleccionados.filter((s) => s.cantidad > 0);
        if (utiles.length === 0) return;
        onSelect?.(utiles);
        onClose?.();
    };

    const elegirUno = (producto) => {
        onSelect?.(producto, unidadDe(producto), Number(cantidades[String(producto.id)] ?? 1) || 1);
        onClose?.();
    };

    /** Escribir una cantidad marca la fila automáticamente. */
    const setCantidad = (producto, valor) => {
        setCantidades((prev) => ({ ...prev, [String(producto.id)]: valor }));
        if (multiple && !marcados[String(producto.id)] && presentacionesDe(producto).length > 0) {
            setMarcados((prev) => ({ ...prev, [String(producto.id)]: true }));
        }
    };

    /** Texto y color del badge de stock según los umbrales del producto. */
    const stockDe = (producto) => {
        const cantidad = stockPorProducto[String(producto.id)];
        if (cantidad == null) return null;

        const valor = Number(cantidad) || 0;
        const minimo = Number(producto.stock_minimo) || 0;
        const maximo = Number(producto.stock_maximo) || 0;
        const abrev = producto.unidad_medida?.abreviatura ?? '';

        let tono = 'bg-green-50 text-green-700';
        if (valor <= 0) tono = 'bg-red-50 text-red-700';
        else if (minimo > 0 && valor < minimo) tono = 'bg-amber-50 text-amber-700';
        else if (maximo > 0 && valor > maximo) tono = 'bg-blue-50 text-blue-700';

        return { valor, texto: `${numero(valor)}${abrev ? ` ${abrev}` : ''}`, tono };
    };

    /**
     * Stock del producto en cada almacén que tiene algo, en metros si la tela
     * se mide así. Con un color filtrado, cuenta solo los metros de ese color
     * (sale de los rollos, que son los que saben de colores).
     */
    const almacenesDe = (producto) => {
        const filas = stockPorAlmacen[String(producto.id)] ?? [];
        const factor = basePorMetro(producto);
        const abrev = factor ? 'm' : (producto.unidad_medida?.abreviatura ?? '');

        return filas
            .map((f) => {
                let cantidad = factor ? f.base / factor : f.base;
                if (filtros.color) {
                    cantidad = f.colores
                        .filter((c) => normalize(c.nombre) === filtros.color)
                        .reduce((s, c) => s + (Number(c.metros) || 0), 0);
                }
                return { ...f, cantidad, abrev: filtros.color ? 'm' : abrev };
            })
            .filter((f) => f.cantidad > 0)
            .sort((a, b) => {
                // El almacén de la venta va primero; el resto, de más a menos.
                if (almacenId && a.almacenId === String(almacenId)) return -1;
                if (almacenId && b.almacenId === String(almacenId)) return 1;
                return b.cantidad - a.cantidad;
            });
    };

    /** Metros por color sumando todos los almacenes. */
    const coloresDe = (producto) => {
        const mapa = new Map();
        (stockPorAlmacen[String(producto.id)] ?? []).forEach((f) =>
            f.colores.forEach((c) => {
                const clave = normalize(c.nombre);
                const previo = mapa.get(clave) ?? { nombre: c.nombre, hex: c.hex, metros: 0 };
                previo.metros += Number(c.metros) || 0;
                mapa.set(clave, previo);
            }),
        );
        return [...mapa.entries()]
            .filter(([clave, c]) => c.metros > 0 && (!filtros.color || clave === filtros.color))
            .map(([, c]) => c)
            .sort((a, b) => b.metros - a.metros);
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            description="Filtra por tipo de tela, color, categoría o marca; mira cuánto hay en cada almacén y ajusta unidad y cantidad."
            size="3xl"
            footer={
                <>
                    <span className="mr-auto text-xs text-warm-500">
                        {resultados.length} {resultados.length === 1 ? 'producto' : 'productos'}
                        {filtrosActivos > 0 && ` · ${filtrosActivos} filtro(s) activo(s)`}
                    </span>
                    <Button variant="secondary" onClick={onClose}>
                        Cerrar
                    </Button>
                    {multiple && (
                        <Button onClick={confirmarMultiple} disabled={seleccionados.length === 0}>
                            <Plus className="h-4 w-4" />
                            Agregar{seleccionados.length > 0 ? ` (${seleccionados.length})` : ''}
                        </Button>
                    )}
                </>
            }
        >
            {/* Buscador, filtros y marcados quedan fijos mientras se recorre la lista. */}
            <div className="sticky -top-4 z-10 -mx-6 space-y-3 bg-white px-6 pb-4 pt-1">
                {/* Buscador y rango de stock comparten fila: el texto ocupa la mitad. */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className={stockFilter ? 'col-span-2' : 'col-span-2 lg:col-span-4'}>
                        <label className="mb-1 block text-xs font-medium text-gray-700">Buscar</label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={filtros.texto}
                                onChange={(e) => setFiltro({ texto: e.target.value })}
                                placeholder="Nombre, código, color o código de barras…"
                                className="block w-full rounded-md border-0 py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                            />
                        </div>
                    </div>

                    {stockFilter && (
                        <>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">Stock</label>
                                <SearchSelect
                                    value={filtros.stockEstado}
                                    onChange={(v) => setFiltro({ stockEstado: v })}
                                    options={ESTADO_STOCK_OPTIONS}
                                    placeholder="Todo el stock"
                                    emptyText="Sin coincidencias"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">Stock hasta</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={filtros.stockHasta}
                                    onChange={(e) => setFiltro({ stockHasta: e.target.value })}
                                    placeholder="Ej. 10 (de 10 a 0)"
                                    className="block w-full rounded-md border-0 px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Lo que más se pregunta en una tienda de telas: qué tejido y en qué color. */}
                <div className="grid grid-cols-2 gap-3">
                    <SearchSelect
                        value={filtros.tipoTejido}
                        onChange={(v) => setFiltro({ tipoTejido: v })}
                        options={tipoTejidoOptions}
                        // Textos cortos: en el móvil van dos filtros por fila y
                        // "Todos los tipos de tela" se cortaba en "Todos los…".
                        placeholder="Tipo de tela"
                        emptyText="Sin coincidencias"
                    />
                    <SearchSelect
                        value={filtros.color}
                        onChange={(v) => setFiltro({ color: v })}
                        options={colorOptions}
                        placeholder="Color"
                        emptyText="Sin coincidencias"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <SearchSelect
                        value={filtros.categoria}
                        // Cambiar de categoría invalida la sub-categoría elegida.
                        onChange={(v) => setFiltro({ categoria: v, subCategoria: '' })}
                        options={categoriaOptions}
                        placeholder="Categoría"
                        emptyText="Sin coincidencias"
                    />
                    <SearchSelect
                        value={filtros.subCategoria}
                        onChange={(v) => setFiltro({ subCategoria: v })}
                        options={subCategoriaOptions}
                        placeholder="Sub-categoría"
                        emptyText="Sin coincidencias"
                    />
                    <SearchSelect
                        value={filtros.marca}
                        onChange={(v) => setFiltro({ marca: v, subMarca: '' })}
                        options={marcaOptions}
                        placeholder="Marca"
                        emptyText="Sin coincidencias"
                    />
                    <SearchSelect
                        value={filtros.subMarca}
                        onChange={(v) => setFiltro({ subMarca: v })}
                        options={subMarcaOptions}
                        placeholder="Sub-marca"
                        emptyText="Sin coincidencias"
                    />
                </div>

                {filtrosActivos > 0 && (
                    <button
                        type="button"
                        onClick={() => setFiltros(filtrosVacios)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 transition hover:text-primary-700"
                    >
                        <RotateCcw className="h-3.5 w-3.5" /> Limpiar filtros
                    </button>
                )}

                {/* Resumen de lo marcado: sobrevive a los cambios de filtro */}
                {multiple && seleccionados.length > 0 && (
                    <div className="max-h-28 overflow-y-auto rounded-xl bg-primary-50 p-3">
                        <p className="mb-2 text-sm font-semibold text-primary-700">
                            Productos seleccionados: {seleccionados.length}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {seleccionados.map(({ producto, presentacion, cantidad }) => (
                                <span
                                    key={producto.id}
                                    className="inline-flex items-center gap-2 rounded-full border border-edge bg-white py-1 pl-3 pr-2 text-sm text-warm-900"
                                >
                                    <span className="max-w-[260px] truncate">
                                        <span className="font-semibold text-primary-600">{cantidad}×</span>{' '}
                                        {producto.nombre}
                                        {presentacion && presentacionesDe(producto).length > 1 && (
                                            <span className="text-warm-500"> · {presentacion.nombre}</span>
                                        )}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => desmarcar(producto.id)}
                                        aria-label={`Quitar ${producto.nombre}`}
                                        className="rounded-full p-0.5 text-primary-600 transition hover:bg-primary-50"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Resultados */}
            {cargando ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : resultados.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <PackageSearch className="h-8 w-8 text-warm-500" />
                    <p className="text-sm text-warm-500">Ningún producto coincide con la búsqueda.</p>
                </div>
            ) : (
                <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-edge">
                    {resultados.map((producto) => {
                        const presentaciones = presentacionesDe(producto);
                        const sinUnidades = presentaciones.length === 0;
                        const presentacion = unidadDe(producto);
                        const marcado = Boolean(marcados[String(producto.id)]);
                        const stock = stockDe(producto);
                        // El catálogo se lista entero, pero lo que no hay en el
                        // almacén se ve y no se puede elegir.
                        const sinStock = bloquearSinStock && stock != null && stock.valor <= 0;
                        const bloqueado = sinUnidades || sinStock;
                        const almacenes = conDesglose ? almacenesDe(producto) : [];
                        const colores = conDesglose ? coloresDe(producto) : [];

                        return (
                            <div
                                key={producto.id}
                                onClick={() => multiple && !bloqueado && alternar(producto)}
                                className={[
                                    'flex flex-wrap items-center gap-x-3 gap-y-2 border-l-4 px-3 py-2.5 transition',
                                    marcado
                                        ? 'border-l-primary-600 bg-primary-50/70'
                                        : 'border-l-transparent hover:bg-primary-50/40',
                                    multiple && !bloqueado ? 'cursor-pointer' : '',
                                    bloqueado ? 'opacity-60' : '',
                                ].join(' ')}
                            >
                                {multiple && (
                                    <input
                                        type="checkbox"
                                        checked={marcado}
                                        disabled={bloqueado}
                                        onChange={() => alternar(producto)}
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label={`Seleccionar ${producto.nombre}`}
                                        className="h-4 w-4 shrink-0 cursor-pointer rounded accent-primary-600"
                                    />
                                )}

                                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-warm-500">
                                    <Package className="h-4 w-4" />
                                </div>

                                <div className="min-w-0 flex-1 basis-40">
                                    <p className="truncate font-semibold text-warm-900">{producto.nombre}</p>
                                    <p className="truncate text-xs text-warm-500">
                                        Código: {producto.codigo ?? '—'}
                                        {producto.tipo_tejido && ` · Tejido ${normalize(producto.tipo_tejido)}`}
                                        {producto.marca?.nombre && ` · ${producto.marca.nombre}`}
                                        {producto.categoria?.nombre && ` · ${producto.categoria.nombre}`}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                        {/* Con desglose por almacén, este total sobra. */}
                                        {stock && !conDesglose && (
                                            <span
                                                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${stock.tono}`}
                                            >
                                                Stock: {stock.texto}
                                            </span>
                                        )}
                                        <span className="text-sm font-semibold text-primary-600">
                                            {money(presentacion?.precio_compra ?? producto.precio_base)}
                                        </span>
                                        {sinUnidades && (
                                            <span className="text-[11px] font-medium text-red-600">Sin unidades</span>
                                        )}
                                        {sinStock && !sinUnidades && (
                                            <span className="text-[11px] font-medium text-red-600">
                                                Sin stock en este almacén
                                            </span>
                                        )}
                                    </div>

                                    {conDesglose && (
                                        <div className="mt-1.5 space-y-1">
                                            {/* Cuánto hay en cada almacén. */}
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {almacenes.length === 0 ? (
                                                    <span className="text-[11px] text-warm-400">
                                                        {filtros.color
                                                            ? 'Sin ese color en ningún almacén'
                                                            : 'Sin stock en ningún almacén'}
                                                    </span>
                                                ) : (
                                                    almacenes.map((a) => {
                                                        const esEste = almacenId && a.almacenId === String(almacenId);
                                                        return (
                                                            <span
                                                                key={a.almacenId}
                                                                className={[
                                                                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
                                                                    esEste
                                                                        ? 'bg-primary-50 font-semibold text-primary-700 ring-1 ring-inset ring-primary-200'
                                                                        : 'bg-gray-100 text-warm-700',
                                                                ].join(' ')}
                                                                title={esEste ? 'Almacén de esta venta' : undefined}
                                                            >
                                                                <Warehouse className="h-3 w-3 shrink-0" />
                                                                {a.almacen}
                                                                <span className="tabular-nums">
                                                                    · {numero(a.cantidad)}
                                                                    {a.abrev ? ` ${a.abrev}` : ''}
                                                                </span>
                                                            </span>
                                                        );
                                                    })
                                                )}
                                            </div>

                                            {/* Cuánto hay de cada color, sumando todos los almacenes. */}
                                            {colores.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                    {colores.map((c) => (
                                                        <span
                                                            key={c.nombre}
                                                            className="inline-flex items-center gap-1 text-[11px] text-warm-700"
                                                        >
                                                            <span
                                                                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                                                                style={{ backgroundColor: c.hex || '#9ca3af' }}
                                                            />
                                                            {c.nombre}
                                                            <span className="font-medium tabular-nums text-warm-900">
                                                                {numero(c.metros)} m
                                                            </span>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {!bloqueado && (
                                  <div
                                    className="flex w-full shrink-0 items-end gap-3 sm:w-auto"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="w-20 shrink-0">
                                        <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-warm-500">
                                            Cant.
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={cantidades[String(producto.id)] ?? '1'}
                                            onChange={(e) => setCantidad(producto, e.target.value)}
                                            aria-label={`Cantidad de ${producto.nombre}`}
                                            // Mismo alto que el Select de al lado.
                                            className="block w-full rounded-md border-0 px-3 py-2 text-center text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                                        />
                                    </div>

                                    <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
                                        <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-warm-500">
                                            Unidad
                                        </label>
                                        <Select
                                            value={presentacion ? String(presentacion.id) : ''}
                                            onChange={(e) =>
                                                setUnidades((prev) => ({
                                                    ...prev,
                                                    [String(producto.id)]: e.target.value,
                                                }))
                                            }
                                            options={presentaciones.map((pres) => ({
                                                value: String(pres.id),
                                                label: pres.nombre,
                                            }))}
                                        />
                                    </div>
                                  </div>
                                )}

                                {!multiple && (
                                    <Button
                                        size="sm"
                                        type="button"
                                        disabled={sinUnidades}
                                        onClick={() => elegirUno(producto)}
                                    >
                                        Elegir
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
}
