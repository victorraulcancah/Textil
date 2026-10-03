import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Eraser, Plus, Repeat, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import { opcionesAlmacen, useAlmacenPropio } from '../lib/almacenes';
import { tipoUnidad } from '../lib/unidades';
import Layout from '../components/Layout';
import ColorSelect from '../components/ColorSelect';
import ProductoPickerModal from '../components/ProductoPickerModal';
import { Alert, Button, Input, SearchSelect, Spinner, cn } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/** Una tela se pide en rollos (con un metraje opcional por rollo); lo demás, por cantidad en su unidad. */
const ROLLOS = 'rollos';

/** El formato "Metro" de una tela; sin él, el producto no se pide por rollos. */
const presentacionMetroDe = (producto) =>
    (producto?.presentaciones ?? []).find((p) => p.activo !== false && tipoUnidad(p) === 'metro') ?? null;

const unidadesDe = (producto) =>
    (producto?.presentaciones ?? []).filter((p) => p.activo !== false).map((p) => ({ value: String(p.id), label: p.nombre }));

const lineaVacia = { producto_id: '', producto_presentacion_id: '', producto_color_id: '', cantidad: '', conMetraje: false, metros_por_rollo: '' };

/**
 * Nuevo requerimiento de traslado. Mismo diseño y misma forma de agregar productos que Nuevo pedido: una fila por
 * tela con sus colores desplegables (rollos), y lo demás línea por línea. El número (RQ002-001…) lo da el almacén al
 * que se le pide.
 */
export default function CrearRequerimiento() {
    const toast = useToast();
    const navigate = useNavigate();
    const { propioId, superAdmin, almacenNombre } = useAlmacenPropio();

    const [cargando, setCargando] = useState(true);
    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [todasExistencias, setTodasExistencias] = useState([]);
    const [origen, setOrigen] = useState('');
    const [pide, setPide] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [lineas, setLineas] = useState([]);
    const [nueva, setNueva] = useState(lineaVacia);
    const [abiertas, setAbiertas] = useState({});
    const [guardando, setGuardando] = useState(false);
    /** Buscador avanzado de productos (el mismo de Pedido y Compra). */
    const [picker, setPicker] = useState({ open: false, query: '' });

    useEffect(() => {
        (async () => {
            try {
                const [a, p, e] = await Promise.all([
                    api.get('/almacenes'),
                    api.get('/productos', { params: { per_page: 500 } }),
                    api.get('/existencias'),
                ]);
                setAlmacenes(asList(a));
                setProductos(asList(p));
                setTodasExistencias(asList(e));
            } catch {
                toast.error('No se pudieron cargar los almacenes y productos.');
            } finally {
                setCargando(false);
            }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const pideId = superAdmin ? pide : String(propioId ?? '');

    /** El stock que se muestra es el del almacén al que se le pide: de ahí sale la mercadería. */
    const existencias = useMemo(
        () => todasExistencias.filter((f) => !origen || String(f.almacen_id ?? f.almacen?.id) === String(origen)),
        [todasExistencias, origen],
    );
    const stockPorProducto = useMemo(() => {
        const porProducto = {};
        for (const fila of existencias) {
            const pid = fila.producto?.id ?? fila.producto_id;
            if (!pid) continue;
            porProducto[pid] = (porProducto[pid] ?? 0) + Number(fila.stock_disponible ?? fila.stock_actual ?? 0);
        }
        return porProducto;
    }, [existencias]);

    /* ------------------------------ renglón ------------------------------ */

    const producto = useMemo(() => productos.find((p) => String(p.id) === String(nueva.producto_id)) ?? null, [productos, nueva.producto_id]);
    const presentaciones = (producto?.presentaciones ?? []).filter((p) => p.activo !== false);
    const presentacion = presentaciones.find((p) => String(p.id) === String(nueva.producto_presentacion_id)) ?? null;
    const metroNueva = presentacionMetroDe(producto);
    const esTelaNueva = Boolean(metroNueva);

    const productoDe = (presentacionId) =>
        productos.find((p) => (p.presentaciones ?? []).some((pr) => String(pr.id) === String(presentacionId))) ?? null;

    /** Rollos libres de la tela (del color elegido, si hay uno) en el almacén al que se le pide. */
    const rollosLibres = useMemo(() => {
        if (!producto) return 0;
        const porColor = new Map();
        for (const fila of existencias) {
            if (String(fila.producto?.id ?? fila.producto_id) !== String(producto.id)) continue;
            for (const c of fila.colores ?? []) {
                const k = String(c.id ?? 'sin');
                const previo = porColor.get(k) ?? { libres: 0, porAsignar: 0 };
                previo.libres += Number(c.rollos_disponibles ?? c.rollos) || 0;
                previo.porAsignar = Math.max(previo.porAsignar, Number(c.rollos_por_asignar) || 0);
                porColor.set(k, previo);
            }
        }
        let total = 0;
        for (const [k, v] of porColor) {
            if (nueva.producto_color_id && k !== String(nueva.producto_color_id)) continue;
            total += Math.max(0, v.libres - v.porAsignar);
        }
        return total;
    }, [producto, existencias, nueva.producto_color_id]);

    /** El stock del producto en la unidad elegida (lo que no es tela). */
    const stockEnUnidad = useMemo(() => {
        if (!producto) return null;
        return (stockPorProducto[producto.id] ?? 0) / (Number(presentacion?.factor_conversion) || 1);
    }, [producto, presentacion, stockPorProducto]);

    const elegirProducto = (id) => {
        const pr = productos.find((p) => String(p.id) === String(id));
        const pres = (pr?.presentaciones ?? []).filter((p) => p.activo !== false);
        const tela = Boolean(presentacionMetroDe(pr));
        setNueva({
            ...lineaVacia,
            producto_id: id ?? '',
            producto_presentacion_id: !tela && pres.length === 1 ? String(pres[0].id) : '',
        });
    };

    const puedeAgregar =
        Boolean(producto) &&
        Number(nueva.cantidad) > 0 &&
        (esTelaNueva
            ? Number.isInteger(Number(nueva.cantidad)) && (!nueva.conMetraje || Number(nueva.metros_por_rollo) > 0)
            : Boolean(nueva.producto_presentacion_id));

    /** Suma rollos a la línea de la misma tela, color y metraje, o crea una nueva. */
    const conRollos = (lista, { prod, metro, color, rollos, metrosPorRollo = null }) => {
        const next = [...lista];
        const j = next.findIndex(
            (l) =>
                l.modo === ROLLOS &&
                String(l.producto_presentacion_id) === String(metro.id) &&
                String(l.producto_color_id || '') === String(color?.id ?? '') &&
                // Rollos de otro metraje son otra línea (no se suman a los de 50 m).
                String(l.metros_por_rollo || '') === String(metrosPorRollo || ''),
        );
        if (j !== -1) {
            next[j] = { ...next[j], rollos_pedidos: String((Number(next[j].rollos_pedidos) || 0) + rollos) };
            return next;
        }
        next.push({
            producto_presentacion_id: String(metro.id),
            producto_color_id: color ? String(color.id) : '',
            producto: prod.nombre,
            color: color?.nombre ?? '',
            modo: ROLLOS,
            rollos_pedidos: String(rollos),
            metros_por_rollo: metrosPorRollo ? String(metrosPorRollo) : '',
            presentacion: 'Rollo',
        });
        return next;
    };

    /** Suma cantidad a la línea del mismo formato y color, o crea una nueva. */
    const conCantidad = (lista, { prod, pres, color, cantidad }) => {
        const next = [...lista];
        const j = next.findIndex(
            (l) =>
                l.modo !== ROLLOS &&
                String(l.producto_presentacion_id) === String(pres.id) &&
                String(l.producto_color_id || '') === String(color?.id ?? ''),
        );
        if (j !== -1) {
            next[j] = { ...next[j], cantidad: String((Number(next[j].cantidad) || 0) + cantidad) };
            return next;
        }
        next.push({
            producto_presentacion_id: String(pres.id),
            producto_color_id: color ? String(color.id) : '',
            producto: prod.nombre,
            color: color?.nombre ?? '',
            modo: 'cantidad',
            cantidad: String(cantidad),
            presentacion: pres.nombre,
        });
        return next;
    };

    const agregar = () => {
        if (!puedeAgregar) return toast.error('Completa el producto y la cantidad.');
        const color = (producto.colores ?? []).find((c) => String(c.id) === String(nueva.producto_color_id));
        if (esTelaNueva) {
            setLineas((prev) =>
                conRollos(prev, {
                    prod: producto,
                    metro: metroNueva,
                    color,
                    rollos: Number(nueva.cantidad),
                    metrosPorRollo: nueva.conMetraje ? Number(nueva.metros_por_rollo) : null,
                }),
            );
        } else {
            setLineas((prev) => conCantidad(prev, { prod: producto, pres: presentacion, color, cantidad: Number(nueva.cantidad) }));
        }
        setNueva(lineaVacia);
    };

    /** Lo que se marca en el buscador avanzado: una tela por color va en rollos; el resto, en su unidad. */
    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((x) => x.presentacion && x.cantidad > 0);
        if (!utiles.length) return;

        setLineas((prev) => {
            let next = [...prev];
            utiles.forEach(({ producto: pr, presentacion: pres, cantidad, color, porRollos }) => {
                const metro = presentacionMetroDe(pr);
                if (metro && (porRollos || tipoUnidad(pres) === 'metro')) {
                    next = conRollos(next, { prod: pr, metro, color, rollos: Math.max(1, Math.round(cantidad)) });
                } else {
                    next = conCantidad(next, { prod: pr, pres, color, cantidad });
                }
            });
            return next;
        });
        setPicker((prev) => ({ ...prev, open: false }));
    };

    const cambiar = (i, campo, valor) => setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
    const quitar = (i) => setLineas((prev) => prev.filter((_, j) => j !== i));
    const quitarVarias = (indices) => setLineas((prev) => prev.filter((_, j) => !indices.includes(j)));
    const alternar = (clave) => setAbiertas((prev) => ({ ...prev, [clave]: !prev[clave] }));

    /** Lo que se ve en la tabla: cada tela en rollos es una fila (sus colores se despliegan); lo demás, línea por línea. */
    const filasTabla = useMemo(() => {
        const filas = [];
        const telas = new Map();
        lineas.forEach((l, i) => {
            if (l.modo !== ROLLOS) {
                filas.push({ tipo: 'linea', clave: `l${i}`, l, i });
                return;
            }
            const clave = String(productoDe(l.producto_presentacion_id)?.id ?? `p${l.producto_presentacion_id}`);
            if (!telas.has(clave)) {
                const tela = { tipo: 'tela', clave, producto: l.producto, indices: [] };
                telas.set(clave, tela);
                filas.push(tela);
            }
            telas.get(clave).indices.push(i);
        });
        return filas;
    }, [lineas, productos]); // eslint-disable-line react-hooks/exhaustive-deps

    const guardar = async () => {
        if (!origen) return toast.error('Elige a qué almacén se lo pides.');
        if (superAdmin && !pide) return toast.error('Elige el almacén que pide.');
        if (lineas.length === 0) return toast.error('Agrega al menos un producto.');
        if (lineas.some((l) => !(Number(l.modo === ROLLOS ? l.rollos_pedidos : l.cantidad) > 0))) {
            return toast.error('Todas las líneas necesitan una cantidad mayor a cero.');
        }
        setGuardando(true);
        try {
            const { data } = await api.post('/transferencias/requerimientos', {
                almacen_origen_id: Number(origen),
                almacen_destino_id: superAdmin ? Number(pide) : undefined,
                observaciones: observaciones || undefined,
                detalles: lineas.map((l) =>
                    l.modo === ROLLOS
                        ? {
                              modo: ROLLOS,
                              producto_presentacion_id: Number(l.producto_presentacion_id),
                              producto_color_id: l.producto_color_id ? Number(l.producto_color_id) : null,
                              rollos_pedidos: Math.max(1, Math.round(Number(l.rollos_pedidos))),
                              metros_por_rollo: Number(l.metros_por_rollo) > 0 ? Number(l.metros_por_rollo) : null,
                          }
                        : {
                              modo: 'cantidad',
                              producto_presentacion_id: Number(l.producto_presentacion_id),
                              producto_color_id: l.producto_color_id ? Number(l.producto_color_id) : null,
                              cantidad: Number(l.cantidad),
                          },
                ),
            });
            toast.success(`Requerimiento ${data.requerimiento} enviado a ${data.origen?.nombre}.`);
            navigate('/requerimientos');
        } catch (err) {
            const e = err.response?.data;
            toast.error(e?.message ?? Object.values(e?.errors ?? {})?.[0]?.[0] ?? 'No se pudo crear el requerimiento.');
        } finally {
            setGuardando(false);
        }
    };

    const opcionesOrigen = opcionesAlmacen(almacenes).filter((o) => o.value !== String(pideId));
    const nombreOrigen = opcionesOrigen.find((o) => o.value === String(origen))?.label;

    const rollosTotal = lineas.filter((l) => l.modo === ROLLOS).reduce((s, l) => s + (Number(l.rollos_pedidos) || 0), 0);

    if (cargando) {
        return (
            <Layout>
                <div className="flex justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                        <Repeat className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="text-xl font-bold text-warm-900">Nuevo requerimiento</h1>
                        <p className="text-sm text-warm-500">
                            Lo que le pides a otro almacén. Ellos escanean, separan y despachan; el número lo da el almacén al que se lo pides.
                        </p>
                    </div>
                </div>
                <Button variant="secondary" onClick={() => navigate('/requerimientos')}>
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start *:min-w-0">
                {/* ── Productos ───────────────────────────────────────── */}
                <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                    <h2 className="text-base font-semibold text-warm-900">Productos</h2>
                    <p className="mb-4 text-sm text-warm-500">
                        {lineas.length} producto{lineas.length === 1 ? '' : 's'} agregado{lineas.length === 1 ? '' : 's'}
                    </p>

                    <div className="space-y-4">
                        <SearchSelect
                            label="Buscar producto"
                            placeholder="Nombre o código…"
                            value={nueva.producto_id}
                            onChange={(v) => elegirProducto(v)}
                            options={productos.map((p) => ({ value: String(p.id), label: p.nombre, keywords: p.codigo }))}
                            searchTitle="Buscador avanzado con filtros"
                            onSearch={(q) => setPicker({ open: true, query: q })}
                        />

                        {/* Solo si la tela tiene colores registrados: hay insumos que no se piden por color. */}
                        {producto?.colores?.length > 0 && (
                            <ColorSelect
                                colores={producto.colores}
                                value={nueva.producto_color_id}
                                onChange={(id) => setNueva((prev) => ({ ...prev, producto_color_id: id }))}
                            />
                        )}

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <Input
                                label="Disponible"
                                value={
                                    !producto
                                        ? ''
                                        : esTelaNueva
                                          ? `${num(rollosLibres)} rollo${rollosLibres === 1 ? '' : 's'}`
                                          : `${num(stockEnUnidad)} ${presentacion?.nombre ?? ''}`.trim()
                                }
                                readOnly
                                disabled
                            />
                            {/* Una tela se pide siempre en rollos; lo demás, en la unidad que se elija. */}
                            {esTelaNueva ? (
                                <Input label="Unidad" value="Rollo" readOnly disabled />
                            ) : (
                                <SearchSelect
                                    label="Unidad"
                                    value={nueva.producto_presentacion_id}
                                    disabled={!producto}
                                    clearable={false}
                                    placeholder={producto ? 'Elegir…' : '—'}
                                    emptyText="Sin unidades"
                                    onChange={(id) => id && setNueva((prev) => ({ ...prev, producto_presentacion_id: id }))}
                                    options={unidadesDe(producto)}
                                />
                            )}
                            <Input
                                label={esTelaNueva ? 'Rollos' : 'Cantidad'}
                                type="number"
                                step={esTelaNueva ? '1' : '0.01'}
                                min="0"
                                value={nueva.cantidad}
                                onChange={(e) => setNueva((prev) => ({ ...prev, cantidad: e.target.value }))}
                            />
                        </div>

                        {/* Una tela: rollos enteros, o rollos de un metraje que el almacén corta si no lo tiene. */}
                        {esTelaNueva && (
                            <div className="-mt-2 space-y-2">
                                <div className="flex flex-wrap items-end gap-4">
                                    <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-medium text-warm-700">
                                        <input
                                            type="checkbox"
                                            checked={nueva.conMetraje}
                                            onChange={(e) => setNueva((prev) => ({ ...prev, conMetraje: e.target.checked, metros_por_rollo: e.target.checked ? prev.metros_por_rollo : '' }))}
                                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                        />
                                        Pedir un metraje por rollo
                                    </label>
                                    {nueva.conMetraje && (
                                        <div className="w-44">
                                            <Input
                                                label="Metros por rollo"
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder="Ej.: 50"
                                                value={nueva.metros_por_rollo}
                                                onChange={(e) => setNueva((prev) => ({ ...prev, metros_por_rollo: e.target.value }))}
                                                className="text-right"
                                            />
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-warm-500">
                                    {producto?.colores?.length > 0 && !nueva.producto_color_id ? 'Elige el color de la tela. ' : ''}
                                    {nueva.conMetraje
                                        ? 'Cada rollo sale con ese metraje: si el almacén no tiene uno de ese largo, corta la tela de otro más grande.'
                                        : 'Se piden rollos enteros, midan lo que midan.'}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={agregar} disabled={!puedeAgregar}>
                                <Plus className="h-4 w-4" />
                                Agregar producto
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => setNueva(lineaVacia)}>
                                <Eraser className="h-4 w-4" />
                                Limpiar
                            </Button>
                        </div>
                    </div>

                    {/* Líneas del requerimiento */}
                    <div className="mt-5 overflow-x-auto rounded-lg border border-edge">
                        <table className="w-full min-w-[560px] text-sm">
                            <thead>
                                <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                    <th className="px-3 py-2">Producto</th>
                                    <th className="px-3 py-2">Presentación</th>
                                    <th className="px-3 py-2 text-right">Cantidad</th>
                                    <th className="w-14 px-3 py-2 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {lineas.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-3 py-10 text-center text-warm-400">
                                            Agrega productos con el buscador de arriba.
                                        </td>
                                    </tr>
                                )}

                                {filasTabla.map((fila) => {
                                    // Una tela: una fila y, al desplegarla, sus colores con los rollos.
                                    if (fila.tipo === 'tela') {
                                        const colores = fila.indices.map((i) => ({ l: lineas[i], i }));
                                        const rollos = colores.reduce((suma, { l }) => suma + (Number(l.rollos_pedidos) || 0), 0);
                                        const abierta = Boolean(abiertas[fila.clave]);
                                        const hexDe = (l) =>
                                            (productoDe(l.producto_presentacion_id)?.colores ?? []).find(
                                                (c) => String(c.id) === String(l.producto_color_id),
                                            )?.hex;

                                        return (
                                            <Fragment key={fila.clave}>
                                                <tr className="cursor-pointer transition hover:bg-gray-50" onClick={() => alternar(fila.clave)}>
                                                    <td className="px-3 py-2">
                                                        <span className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                aria-expanded={abierta}
                                                                aria-label={abierta ? 'Ocultar colores' : 'Ver colores'}
                                                                className="rounded p-0.5 text-warm-500 hover:bg-gray-100"
                                                            >
                                                                <ChevronRight className={cn('h-4 w-4 transition-transform duration-300', abierta && 'rotate-90')} />
                                                            </button>
                                                            <span className="font-medium text-warm-900">{fila.producto}</span>
                                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                                                                {colores.length} color{colores.length === 1 ? '' : 'es'}
                                                            </span>
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-warm-700">Rollo</td>
                                                    <td className="px-3 py-2 text-right font-medium text-warm-900">
                                                        {rollos} rollo{rollos === 1 ? '' : 's'}
                                                    </td>
                                                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            type="button"
                                                            aria-label={`Quitar ${fila.producto}`}
                                                            onClick={() => quitarVarias(fila.indices)}
                                                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                                {/* Los colores se despliegan con una animación de altura. */}
                                                <tr className="border-b-0">
                                                    <td colSpan={4} className="p-0">
                                                        <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', abierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                                                            <div className="overflow-hidden">
                                                                <div className={cn('bg-gray-50/70 py-1 pl-10 pr-3 transition-opacity duration-300', abierta ? 'border-b border-gray-100 opacity-100' : 'opacity-0')}>
                                                                    <div className="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-3 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-warm-500">
                                                                        <span>Color</span>
                                                                        <span className="text-right">Rollos</span>
                                                                        <span />
                                                                    </div>
                                                                    {colores.map(({ l, i }) => (
                                                                        <div key={i} className="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-3 px-2 py-1.5">
                                                                            <span className="inline-flex items-center gap-2 font-medium uppercase text-warm-800">
                                                                                <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: hexDe(l) || '#9ca3af' }} />
                                                                                {l.color || 'Cualquier color'}
                                                                                {Number(l.metros_por_rollo) > 0 && (
                                                                                    <span className="text-xs font-semibold normal-case text-primary-700">
                                                                                        · rollos de {num(l.metros_por_rollo)} m
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                            <Input
                                                                                type="number"
                                                                                step="1"
                                                                                min="1"
                                                                                value={l.rollos_pedidos}
                                                                                onChange={(e) => cambiar(i, 'rollos_pedidos', e.target.value)}
                                                                                className="text-right"
                                                                                aria-label={`Rollos de ${fila.producto} ${l.color}`}
                                                                                tabIndex={abierta ? 0 : -1}
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                aria-label={`Quitar ${l.color || 'color'}`}
                                                                                onClick={() => quitar(i)}
                                                                                tabIndex={abierta ? 0 : -1}
                                                                                className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </Fragment>
                                        );
                                    }

                                    // Lo demás (hilos, cierres…): una línea por producto.
                                    const { l, i } = fila;
                                    const opciones = unidadesDe(productoDe(l.producto_presentacion_id));

                                    return (
                                        <tr key={fila.clave}>
                                            <td className="px-3 py-2">
                                                <span className="font-medium text-warm-900">{l.producto}</span>
                                                {l.color && (
                                                    <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-warm-700">{l.color}</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                {opciones.length === 0 ? (
                                                    <span className="text-warm-600">{l.presentacion}</span>
                                                ) : (
                                                    <SearchSelect
                                                        value={String(l.producto_presentacion_id)}
                                                        clearable={false}
                                                        emptyText="Sin unidades"
                                                        onChange={(id) => id && cambiar(i, 'producto_presentacion_id', id)}
                                                        options={opciones}
                                                    />
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={l.cantidad}
                                                    onChange={(e) => cambiar(i, 'cantidad', e.target.value)}
                                                    className="ml-auto w-24 text-right"
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <button
                                                    type="button"
                                                    aria-label="Quitar"
                                                    onClick={() => quitar(i)}
                                                    className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ── Requerimiento y resumen ─────────────────────────── */}
                <div className="space-y-4">
                    <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-4 text-base font-semibold text-warm-900">Requerimiento</h2>

                        <div className="space-y-4">
                            {superAdmin ? (
                                <SearchSelect
                                    label="Almacén que pide"
                                    placeholder="Elige el almacén"
                                    value={pide}
                                    disabled={lineas.length > 0}
                                    onChange={(v) => setPide(v ?? '')}
                                    options={opcionesAlmacen(almacenes, pide)}
                                />
                            ) : (
                                <p className="rounded-md bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700">
                                    Lo pide tu almacén: {almacenNombre ?? 'sin almacén asignado'}. La mercadería llega ahí.
                                </p>
                            )}
                            <SearchSelect
                                label="Se lo pides al almacén"
                                placeholder="Elige el almacén"
                                value={origen}
                                onChange={(v) => setOrigen(v ?? '')}
                                options={opcionesOrigen}
                            />
                            <Input label="Observación" placeholder="Referencia…" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
                        </div>

                        <Alert variant="info" className="mt-4">
                            {nombreOrigen
                                ? `Solo los usuarios de ${nombreOrigen} ven este requerimiento: ellos lo preparan y lo despachan.`
                                : 'Solo los usuarios del almacén al que se lo pides ven este requerimiento: ellos lo preparan y lo despachan.'}
                        </Alert>
                    </section>

                    <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-base font-semibold text-warm-900">Resumen</h2>
                        <dl className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                                <dt className="text-warm-500">Productos</dt>
                                <dd className="font-semibold text-warm-900">{filasTabla.length}</dd>
                            </div>
                            {rollosTotal > 0 && (
                                <div className="flex items-center justify-between">
                                    <dt className="text-warm-500">Rollos</dt>
                                    <dd className="font-semibold text-warm-900">{num(rollosTotal)}</dd>
                                </div>
                            )}
                        </dl>
                    </section>

                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => navigate('/requerimientos')}>
                            Cancelar
                        </Button>
                        <Button loading={guardando} disabled={!lineas.length} onClick={guardar}>
                            Registrar requerimiento
                        </Button>
                    </div>
                </div>
            </div>

            {/* Buscador avanzado: el stock que muestra es el del almacén al que se le pide. */}
            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((prev) => ({ ...prev, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                // Una tela se elige por color y en rollos.
                porColor
                productos={productos}
                stockPorProducto={stockPorProducto}
                bloquearSinStock={false}
                existencias={existencias}
                title="Buscar productos"
            />
        </Layout>
    );
}
